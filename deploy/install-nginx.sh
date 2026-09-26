#!/usr/bin/env bash
# Yalnızca webtasarimajansi.net server block'unu ekler ve sertifika alır.
# Diğer site dosyalarına dokunmaz; nginx -t başarısızsa reload etmez ve eski hâline döner.
set -euo pipefail
ROOT=/opt/mcht/webtasarimajansi
CONF=/etc/nginx/sites-available/webtasarimajansi.net
LINK=/etc/nginx/sites-enabled/webtasarimajansi.net
EMAIL=${LE_EMAIL:-mchttasarim@gmail.com}
IP=$(curl -fsS -4 https://api.ipify.org || hostname -I | awk '{print $1}')
for d in webtasarimajansi.net www.webtasarimajansi.net; do
  r=$(getent ahostsv4 "$d" | awk '{print $1}' | head -1)
  [ "$r" = "$IP" ] || { echo "DNS: $d → ${r:-yok} (bu sunucu $IP değil). Durduruldu."; exit 1; }
done
nginx -t || { echo "Mevcut Nginx yapılandırması zaten hatalı — dokunulmadı."; exit 1; }
install_conf() {
  local src=$1 backup
  backup=$(mktemp); [ -f "$CONF" ] && cp "$CONF" "$backup" || : > "$backup"
  cp "$src" "$CONF"; ln -sf "$CONF" "$LINK"
  if nginx -t; then systemctl reload nginx; else
    echo "nginx -t başarısız — geri alınıyor"; if [ -s "$backup" ]; then cp "$backup" "$CONF"; else rm -f "$CONF" "$LINK"; fi; exit 1; fi
}
mkdir -p /var/www/webtasarimajansi-acme
if [ ! -f /etc/letsencrypt/live/webtasarimajansi.net/fullchain.pem ]; then
  install_conf "$ROOT/deploy/nginx/webtasarimajansi.net.http.conf"
  certbot certonly --webroot -w /var/www/webtasarimajansi-acme -d webtasarimajansi.net -d www.webtasarimajansi.net \
    --cert-name webtasarimajansi.net --non-interactive --agree-tos -m "$EMAIL" --deploy-hook "systemctl reload nginx"
fi
install_conf "$ROOT/deploy/nginx/webtasarimajansi.net.conf"
for u in https://webtasarimajansi.net https://pazar.mchttasarim.com.tr; do printf '%s → ' "$u"; curl -s -o /dev/null -w '%{http_code}\n' "$u"; done
