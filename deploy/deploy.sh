#!/usr/bin/env bash
# Geriye uyumluluk: tek dağıtım yolu scripts/deploy.sh (kilit, yedek, sağlık kontrolü, geri dönüş).
exec "$(cd "$(dirname "$0")/.." && pwd)/scripts/deploy.sh" "$@"
