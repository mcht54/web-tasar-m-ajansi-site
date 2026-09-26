#!/usr/bin/env bash
# Mac'ten VPS'e kaynak kodu gönderir (yalnızca /opt/mcht/webtasarimajansi). Sunucuya ait
# dosyalar (.env, backups, snapshots, .build) korunur. Kullanım: deploy/push.sh [ssh-hedefi]
set -euo pipefail
TARGET=${1:?Kullanım: deploy/push.sh kullanıcı@sunucu}
KEY=${SSH_KEY:-$HOME/.ssh/webtasarimajansi_deploy_ed25519}
SSH=(ssh -o StrictHostKeyChecking=yes); [ -f "$KEY" ] && SSH+=(-i "$KEY" -o IdentitiesOnly=yes)
cd "$(dirname "$0")/.."
"${SSH[@]}" "$TARGET" 'mkdir -p /opt/mcht/webtasarimajansi'
rsync -az --delete -e "${SSH[*]}" \
  --exclude node_modules --exclude .next --exclude .next-e2e --exclude .git --exclude storage --exclude .local \
  --exclude .env --exclude '.env.*' --exclude backups --exclude deploy/snapshots --exclude .build --exclude tsconfig.tsbuildinfo \
  ./ "$TARGET:/opt/mcht/webtasarimajansi/"
echo "gönderildi → $TARGET:/opt/mcht/webtasarimajansi"
