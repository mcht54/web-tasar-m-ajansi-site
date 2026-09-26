#!/usr/bin/env bash
# webtasarimajansi — güvenli production dağıtımı (GitHub Actions ve manuel: ./scripts/deploy.sh [commit])
#
# YALNIZCA /opt/mcht/webtasarimajansi ve "webtasarimajansi" Compose projesi üzerinde çalışır.
# Aynı sunucudaki diğer projelere (container, network, volume, .env, Nginx) dokunmaz;
# öncesi/sonrası durumlarını karşılaştırır. Hiçbir zaman "down", "down -v", volume silme
# veya "git clean" kullanmaz. Production .env Git'ten gelmez, sunucuda kalır.
#
# Akış: kilit → kontroller → kod (origin/main) → DB yedeği → imajlar (eski container'lar çalışırken)
#       → migration (yalnızca ileri, veri silmez) → derleme → yeni container'lar → sağlık kontrolü
#       → başarısızsa önceki imajlara + koda otomatik dönüş (DB'ye dokunmadan).
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

snapshot() {
  {
    echo "# containers"; docker ps -a --format '{{.Names}}|{{.ID}}|{{.Image}}|{{.State}}|{{.Networks}}' | grep -v '^webtasarimajansi-' | sort || true
    echo "# networks";   docker network ls --format '{{.ID}}|{{.Name}}|{{.Driver}}' | grep -v '|webtasarimajansi-' | sort || true
    echo "# volumes";    docker volume ls --format '{{.Name}}' | grep -v '^webtasarimajansi_' | sort || true
    echo "# compose";    docker compose ls -a --format json | tr '}' '\n' | grep -o '"Name":"[^"]*"' | grep -v '"webtasarimajansi"' | sort || true
  }
}
mkdir -p deploy/snapshots backups
STAMP=$(date +%Y%m%d-%H%M%S)
snapshot > "deploy/snapshots/others-before-$STAMP.txt"

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
  "${COMPOSE[@]}" up -d --no-build web worker scheduler
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

# ── 6. Yeni imajlar (çalışan container'lar durdurulmaz) ──
say "Araç imajı"
"${COMPOSE[@]}" build migrate
say "Migration (ileri, eklemeli) + seed (yalnızca eksik kayıtları ekler)"
"${COMPOSE[@]}" run --rm migrate
say "Üretim derlemesi"
mkdir -p .build
"${COMPOSE[@]}" run --rm builder
if grep -rlE 'https?://(localhost|127\.0\.0\.1|0\.0\.0\.0)' .build/static >/dev/null 2>&1; then rollback "istemci paketinde yerel adres"; fi
say "Web imajı"
"${COMPOSE[@]}" build web

# ── 7. Geçiş + sağlık kontrolü ──
say "Yeni container'lar"
"${COMPOSE[@]}" up -d --no-build web worker scheduler
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
for c in web worker scheduler db; do
  st=$(docker inspect -f '{{.State.Status}} {{.RestartCount}}' "$PROJECT-$c" 2>/dev/null || echo "yok 0")
  echo "  $PROJECT-$c: $st"
  case "$st" in running\ 0|running\ 1) ;; *) rollback "$PROJECT-$c çalışmıyor veya yeniden başlıyor ($st)";; esac
done
HTML=$(curl -fsS -H "Host: ${SITE_URL#*://}" "http://127.0.0.1:$WEB_PORT/")
echo "$HTML" | grep -qE '(localhost|127\.0\.0\.1|0\.0\.0\.0)' && rollback "HTML'de yerel adres"
trap - ERR

# ── 8. Diğer projeler değişmedi mi? ──
say "Diğer projeler (izolasyon)"
snapshot > "deploy/snapshots/others-after-$STAMP.txt"
if diff -u "deploy/snapshots/others-before-$STAMP.txt" "deploy/snapshots/others-after-$STAMP.txt"; then
  echo "✓ Diğer projelerin container, network, volume ve compose durumu AYNI."
else
  note "WARN others-changed $NEW_SHA"; echo "✗ UYARI: diğer projelerde fark var (yukarıda) — bu dağıtım onlara dokunmadı; inceleyin."; exit 2
fi
echo "$NEW_SHA" > "$ROOT/.last-successful-deploy"
note "OK $NEW_SHA"
docker image prune -f --filter "label=com.docker.compose.project=$PROJECT" >/dev/null 2>&1 || true
say "Dağıtım başarılı: $NEW_SHA"
"${COMPOSE[@]}" ps
