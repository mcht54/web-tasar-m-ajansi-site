#!/usr/bin/env bash
# webtasarimajansi — güvenli production dağıtımı (GitHub Actions ve manuel: ./scripts/deploy.sh [commit])
#
# YALNIZCA /opt/mcht/webtasarimajansi ve "webtasarimajansi" Compose projesi üzerinde çalışır.
# Aynı sunucudaki diğer projelere (container, network, volume, .env, Nginx) dokunmaz;
# öncesi/sonrası durumlarını karşılaştırır. Hiçbir zaman "down", "down -v", volume silme
# veya "git clean" kullanmaz. Production .env Git'ten gelmez, sunucuda kalır.
#
# Akış: kilit → kontroller → kod (origin/main) → GHCR'dan imaj (sunucuda DERLEME YOK) → DB yedeği
#       → migration (yalnızca ileri, veri silmez) → yeni container'lar → sağlık kontrolü
#       → önbellek yenileme + ısıtma → başarısızsa önceki imajlara + koda otomatik dönüş (DB'ye dokunmadan).
# İmajlar GitHub Actions'ta derlenir: ghcr.io/<sahip>/webtasarimajansi-{web,tools}:<commit>.
set -Eeuo pipefail

# Betik kendi kopyasından çalışır: aşağıdaki "git reset" bu dosyayı değiştirse de
# çalışan dağıtım etkilenmez (bash betikleri satır satır okur).
if [ -z "${WTA_DEPLOY_COPY:-}" ]; then
  tmp=$(mktemp /tmp/webtasarimajansi-deploy.XXXXXX)
  cp "$0" "$tmp"
  WTA_DEPLOY_COPY=1 exec bash "$tmp" "$@"
fi
trap 'rm -f "$0"' EXIT

ROOT=${DEPLOY_ROOT:-/opt/mcht/webtasarimajansi}
case "$ROOT" in */webtasarimajansi) ;; *) echo "Güvenlik: dağıtım kökü */webtasarimajansi olmalı ($ROOT)"; exit 1 ;; esac
BRANCH=main
TARGET_SHA=${1:-}
PROJECT=webtasarimajansi
cd "$ROOT"
[ -f deploy/docker-compose.yml ] || { echo "deploy/docker-compose.yml yok — yanlış dizin?"; exit 1; }
COMPOSE=(docker compose -p "$PROJECT" -f "$ROOT/deploy/docker-compose.yml" --env-file "$ROOT/.env")
LOG="$ROOT/deploy-history.log"
say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
note() { echo "$(date -u +%FT%TZ) $*" >> "$LOG"; }

# ── 1. Kilit: aynı anda tek dağıtım ──
exec 9>"$ROOT/.deploy.lock"
flock -n 9 || { echo "Başka bir dağıtım sürüyor (kilit: $ROOT/.deploy.lock)"; exit 75; }

# ── 2. Ön kontroller ──
say "Ön kontroller"
command -v docker >/dev/null && docker compose version >/dev/null || { echo "docker compose v2 gerekli"; exit 1; }
[ -f .env ] || { echo "Production .env yok: cp deploy/.env.production.example .env ve SEED_ADMIN_PASSWORD girin (bkz. README)"; exit 1; }
chmod 600 .env
set -a; . ./.env; set +a
for v in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB APP_SECRET SITE_URL; do [ -n "${!v:-}" ] || { echo ".env: $v boş"; exit 1; }; done
: "${WEB_PORT:=3400}"
: "${IMAGE_PREFIX:=ghcr.io/mcht54/webtasarimajansi}"   # yalnızca bu projenin imajları
case "$IMAGE_PREFIX" in */webtasarimajansi) ;; *) echo "Güvenlik: IMAGE_PREFIX */webtasarimajansi olmalı"; exit 1 ;; esac
: "${MIN_FREE_GB:=3}"
# Kayıt defteri kimlik bilgisi (paket özelse) yalnızca bu projenin klasöründe ve yalnızca
# giriş/indirme komutlarında kullanılır; diğer Docker komutları ve projeler etkilenmez.
REG=(docker)
if [ -n "${GHCR_TOKEN:-}" ]; then
  mkdir -p "$ROOT/.docker" && chmod 700 "$ROOT/.docker"
  REG=(env DOCKER_CONFIG="$ROOT/.docker" docker)
fi
# Boş disk (POSIX df; Docker veri klasörü görünmüyorsa proje kökünün diski)
DOCKER_DIR=$(docker info -f '{{.DockerRootDir}}' 2>/dev/null || true); [ -d "$DOCKER_DIR" ] || DOCKER_DIR="$ROOT"
FREE_GB=$(df -Pk "$DOCKER_DIR" | awk 'NR==2 {print int($4/1048576)}')
[ "${FREE_GB:-0}" -ge "$MIN_FREE_GB" ] || { echo "Disk: yalnızca ${FREE_GB}G boş (en az ${MIN_FREE_GB}G gerekli) — diğer projeleri korumak için durduruldu"; exit 1; }

snapshot() {
  # Docker'a ulaşılamazsa boş liste üretip "değişmedi" demesin: hata ver
  local ps nets vols comp
  ps=$(docker ps -a --format '{{.Names}}|{{.ID}}|{{.Image}}|{{.State}}|{{.Networks}}') || { echo "snapshot: docker ps başarısız" >&2; return 1; }
  nets=$(docker network ls --format '{{.ID}}|{{.Name}}|{{.Driver}}') || { echo "snapshot: docker network ls başarısız" >&2; return 1; }
  vols=$(docker volume ls --format '{{.Name}}') || { echo "snapshot: docker volume ls başarısız" >&2; return 1; }
  comp=$(docker compose ls -a --format json) || { echo "snapshot: docker compose ls başarısız" >&2; return 1; }
  echo "# containers"; printf '%s\n' "$ps" | grep -v '^webtasarimajansi-' | sort || true
  echo "# networks";   printf '%s\n' "$nets" | grep -v '|webtasarimajansi-' | sort || true
  echo "# volumes";    printf '%s\n' "$vols" | grep -v '^webtasarimajansi_' | sort || true
  echo "# compose";    printf '%s\n' "$comp" | tr '}' '\n' | grep -o '"Name":"[^"]*"' | grep -v '"webtasarimajansi"' | sort || true
}
mkdir -p deploy/snapshots backups
STAMP=$(date +%Y%m%d-%H%M%S)
snapshot > "deploy/snapshots/others-before-$STAMP.txt" || { echo "Diğer projelerin durumu okunamadı — güvenlik için durduruldu"; exit 1; }

# ── 3. Kod: origin/main (yalnızca izlenen dosyalar; .env/yedekler/.build dokunulmaz) ──
say "Kod"
PREV_SHA=$(git rev-parse HEAD 2>/dev/null || echo none)
git fetch --prune origin "$BRANCH"
if [ -n "$TARGET_SHA" ]; then
  git merge-base --is-ancestor "$TARGET_SHA" "origin/$BRANCH" || { echo "$TARGET_SHA origin/$BRANCH üzerinde değil — reddedildi"; exit 1; }
fi
git checkout -q "$BRANCH"
git reset -q --hard "${TARGET_SHA:-origin/$BRANCH}"
NEW_SHA=$(git rev-parse HEAD)
echo "önceki: $PREV_SHA → yeni: $NEW_SHA"
WEB_REMOTE="$IMAGE_PREFIX-web:$NEW_SHA"
TOOLS_REMOTE="$IMAGE_PREFIX-tools:$NEW_SHA"
note "START $PREV_SHA -> $NEW_SHA"

# ── 4. Geri dönüş için mevcut imajları sakla ──
FIRST_INSTALL=1
if docker image inspect "$PROJECT-web:latest" >/dev/null 2>&1; then
  FIRST_INSTALL=0
  docker image tag "$PROJECT-web:latest" "$PROJECT-web:previous"
  docker image tag "$PROJECT-tools:latest" "$PROJECT-tools:previous"
fi

# /health 200 dönene kadar bekler.
wait_healthy() {
  local tries=$1 i code
  for i in $(seq 1 "$tries"); do
    code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$WEB_PORT/health" || true)
    [ "$code" = 200 ] && return 0
    sleep 2
  done
  return 1
}

rollback() {
  trap - ERR # geri dönüş sırasında yeniden tetiklenmesin
  local why=$1
  say "GERİ DÖNÜŞ: $why"
  note "FAIL $NEW_SHA ($why)"
  if [ "$FIRST_INSTALL" = 1 ]; then echo "İlk kurulum: dönülecek önceki sürüm yok. Servisler olduğu gibi bırakıldı."; exit 1; fi
  docker image tag "$PROJECT-web:previous" "$PROJECT-web:latest"
  docker image tag "$PROJECT-tools:previous" "$PROJECT-tools:latest"
  [ "$PREV_SHA" != none ] && git reset -q --hard "$PREV_SHA"
  # Önceki sürümün compose'undaki servisler (db hariç); fazladan kalan servis konteyneri kaldırılır
  "${COMPOSE[@]}" up -d --no-build --remove-orphans $("${COMPOSE[@]}" config --services | grep -vx db)
  if wait_healthy 60; then echo "✓ Önceki sürüm ($PREV_SHA) yeniden çalışıyor."; note "ROLLBACK-OK $PREV_SHA"
  else echo "✗ Önceki sürüm de sağlıklı değil — elle müdahale gerekli."; note "ROLLBACK-FAIL $PREV_SHA"; fi
  echo "Not: veritabanı migration'ları geri alınmaz (yalnızca ileri, eklemeli migration'lar; veri kaybı riski yok)."
  exit 1
}
trap 'rollback "komut hatası (satır $LINENO)"' ERR

# ── 5. Veritabanı + yedek (migration'dan ÖNCE) ──
say "Veritabanı"
"${COMPOSE[@]}" up -d db
for i in $(seq 1 60); do [ "$(docker inspect -f '{{.State.Health.Status}}' "$PROJECT-db" 2>/dev/null)" = healthy ] && break; sleep 2; done
[ "$(docker inspect -f '{{.State.Health.Status}}' "$PROJECT-db")" = healthy ] || rollback "veritabanı sağlıklı değil"
if docker exec "$PROJECT-db" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select to_regclass('public.\"Page\"')" | grep -q Page; then
  say "Dağıtım öncesi yedek"; BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-7} bash deploy/backup.sh
else
  # İlk kurulum: yönetici şifresi .env'de olmalı (rastgele şifre konteyner içinde kaybolurdu)
  [ -n "${SEED_ADMIN_PASSWORD:-}" ] || { trap - ERR; echo "İlk kurulum: .env içinde SEED_ADMIN_PASSWORD gerekli"; exit 1; }
fi

# ── 6. İmajlar GHCR'dan (sunucuda derleme yok; çalışan container'lar durdurulmaz) ──
say "İmajlar: $IMAGE_PREFIX-{web,tools}:$NEW_SHA"
if [ -n "${GHCR_TOKEN:-}" ]; then printf '%s' "$GHCR_TOKEN" | "${REG[@]}" login ghcr.io -u "${GHCR_USER:?GHCR_USER gerekli}" --password-stdin >/dev/null; fi
"${REG[@]}" pull -q "$WEB_REMOTE" >/dev/null || rollback "web imajı indirilemedi ($WEB_REMOTE) — CI bu commit için imaj üretti mi?"
"${REG[@]}" pull -q "$TOOLS_REMOTE" >/dev/null || rollback "araç imajı indirilemedi ($TOOLS_REMOTE)"
for img in "$WEB_REMOTE" "$TOOLS_REMOTE"; do
  rev=$(docker image inspect -f '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$img")
  [ "$rev" = "$NEW_SHA" ] || rollback "imaj revizyonu uyuşmuyor ($img: $rev)"
done
docker image tag "$WEB_REMOTE" "$PROJECT-web:latest"
docker image tag "$TOOLS_REMOTE" "$PROJECT-tools:latest"
say "Migration (ileri, eklemeli) + seed (yalnızca eksik kayıtları ekler)"
"${COMPOSE[@]}" run --rm migrate

# ── 7. Geçiş + sağlık kontrolü ──
say "Yeni container'lar"
# --remove-orphans: compose'dan çıkarılmış servisin (ör. eski ayrı scheduler) konteynerini kaldırır
"${COMPOSE[@]}" up -d --no-build --remove-orphans web worker
wait_healthy 90 || rollback "/health 200 dönmedi"

check() {
  local path=$1 code
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: ${SITE_URL#*://}" -H "X-Forwarded-Proto: https" "http://127.0.0.1:$WEB_PORT$path" || true)
  echo "  $path → $code"; [ "$code" = 200 ]
}
say "Doğrulama"
curl -fsS "http://127.0.0.1:$WEB_PORT/health" | grep -q '"database":{"status":"ok"' || rollback "veritabanı bağlantısı yok"
for p in / /sitemap.xml /robots.txt /health; do check "$p" || rollback "$p 200 dönmedi"; done
sleep 15 # crash loop tespiti için bekle
for c in web worker db; do
  st=$(docker inspect -f '{{.State.Status}} {{.RestartCount}}' "$PROJECT-$c" 2>/dev/null || echo "yok 0")
  echo "  $PROJECT-$c: $st"
  case "$st" in running\ 0|running\ 1) ;; *) rollback "$PROJECT-$c çalışmıyor veya yeniden başlıyor ($st)";; esac
done
# İmaj CI'da derlendiği için önceden oluşturulmuş sayfalar CI verisindendir: uygulama
# önbelleğini hemen geçersiz kıl (production veritabanından yeniden oluşturulsun) ve ısıt.
say "Önbellek yenileme + ısıtma"
KEYHEX=$(printf '%s' "hmac:$APP_SECRET" | openssl dgst -sha256 -binary | od -An -tx1 | tr -d ' \n')
TOKEN=$(printf '%s' "internal-revalidate" | openssl dgst -sha256 -mac HMAC -macopt "hexkey:$KEYHEX" | awk '{print $NF}')
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "x-internal-token: $TOKEN" "http://127.0.0.1:$WEB_PORT/api/internal/revalidate" || true)
[ "$code" = 200 ] || rollback "önbellek yenilenemedi (HTTP $code) — APP_SECRET uyuşmuyor olabilir"
# Mutlak URL → yol (https://alan/a/b → /a/b; https://alan/ → /)
path_of() { local x=${1#*://}; case "$x" in */*) echo "/${x#*/}" ;; *) echo "/" ;; esac; }
lget() { curl -fsS -H "Host: ${SITE_URL#*://}" -H "X-Forwarded-Proto: https" "http://127.0.0.1:$WEB_PORT$1"; }
warm=0
for sm in $(lget /sitemap.xml | grep -o '<loc>[^<]*</loc>' | sed 's/<[^>]*>//g'); do
  for u in $(lget "$(path_of "$sm")" 2>/dev/null | grep -o '<loc>[^<]*</loc>' | sed 's/<[^>]*>//g' | head -500); do
    lget "$(path_of "$u")" >/dev/null 2>&1 && warm=$((warm+1))
  done
done
echo "  ısıtılan sayfa: $warm"
HTML=$(curl -fsS -H "Host: ${SITE_URL#*://}" "http://127.0.0.1:$WEB_PORT/")
echo "$HTML" | grep -qE '(localhost|127\.0\.0\.1|0\.0\.0\.0)' && rollback "HTML'de yerel adres"
trap - ERR

# ── 8. Diğer projeler değişmedi mi? ──
say "Diğer projeler (izolasyon)"
snapshot > "deploy/snapshots/others-after-$STAMP.txt" || { echo "Diğer projelerin son durumu okunamadı — elle kontrol edin"; exit 2; }
if diff -u "deploy/snapshots/others-before-$STAMP.txt" "deploy/snapshots/others-after-$STAMP.txt"; then
  echo "✓ Diğer projelerin container, network, volume ve compose durumu AYNI."
else
  note "WARN others-changed $NEW_SHA"; echo "✗ UYARI: diğer projelerde fark var (yukarıda) — bu dağıtım onlara dokunmadı; inceleyin."; exit 2
fi
echo "$NEW_SHA" > "$ROOT/.last-successful-deploy"
note "OK $NEW_SHA"
# Disk: yalnızca bu projenin eski GHCR imajlarını sil (şimdiki ve önceki sürüm korunur)
KEEP="$(docker image inspect -f '{{.Id}}' "$PROJECT-web:latest" "$PROJECT-tools:latest" "$PROJECT-web:previous" "$PROJECT-tools:previous" 2>/dev/null | sort -u)"
for ref in $(docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -E "^$IMAGE_PREFIX-(web|tools):" || true); do
  id=$(docker image inspect -f '{{.Id}}' "$ref"); echo "$KEEP" | grep -q "$id" || docker image rm "$ref" >/dev/null 2>&1 || true
done
say "Dağıtım başarılı: $NEW_SHA"
"${COMPOSE[@]}" ps
