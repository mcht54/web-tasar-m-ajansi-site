#!/usr/bin/env bash
# webtasarimajansi veritabanı yedeği — yalnızca webtasarimajansi-db konteynerini kullanır.
# Cron: /etc/cron.d/webtasarimajansi-backup (install-cron.sh). Varsayılan 7 gün saklanır (BACKUP_RETENTION_DAYS).
set -euo pipefail
ROOT=${DEPLOY_ROOT:-/opt/mcht/webtasarimajansi}
DIR="$ROOT/backups"
mkdir -p "$DIR" && chmod 700 "$DIR"
set -a; . "$ROOT/.env"; set +a
TS=$(date +%Y%m%d-%H%M%S)
docker exec webtasarimajansi-db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$DIR/webtasarimajansi-$TS.dump"
test -s "$DIR/webtasarimajansi-$TS.dump" || { echo "yedek boş!"; exit 1; }
find "$DIR" -name 'webtasarimajansi-*.dump' -mtime +"${BACKUP_RETENTION_DAYS:-7}" -delete
echo "yedek: $DIR/webtasarimajansi-$TS.dump ($(du -h "$DIR/webtasarimajansi-$TS.dump" | cut -f1))"
