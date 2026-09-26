#!/usr/bin/env bash
# Yalnızca bu projenin günlük veritabanı yedeği (ayrı cron dosyası).
set -euo pipefail
echo '30 3 * * * root /opt/mcht/webtasarimajansi/deploy/backup.sh >> /opt/mcht/webtasarimajansi/backups/backup.log 2>&1' > /etc/cron.d/webtasarimajansi-backup
chmod 644 /etc/cron.d/webtasarimajansi-backup
echo "cron kuruldu: /etc/cron.d/webtasarimajansi-backup"
