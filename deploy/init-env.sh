#!/usr/bin/env bash
# İlk kurulum: /opt/mcht/webtasarimajansi/.env oluşturur (sırlar sunucuda üretilir, Git'e girmez).
set -euo pipefail
ROOT=${DEPLOY_ROOT:-/opt/mcht/webtasarimajansi}
cd "$ROOT"
[ -f .env ] && { echo ".env zaten var — dokunulmadı."; exit 0; }
cp deploy/.env.production.example .env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|; s|^APP_SECRET=.*|APP_SECRET=$(openssl rand -hex 48)|" .env
chmod 600 .env
echo ".env oluşturuldu. Şimdi SEED_ADMIN_PASSWORD girin: nano $ROOT/.env"
