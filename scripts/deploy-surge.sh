#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="${1:-sideline-sports.surge.sh}"

export PATH="/Users/hdymacuser/.nvm/versions/node/v24.14.0/bin:$PATH"

if ! command -v node &>/dev/null; then
  echo "Node.js が必要です" >&2
  exit 1
fi

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

cp "$ROOT/output/sideline.html" "$TEMP_DIR/index.html"
cp "$ROOT/gmail-bridge/Code.gs" "$TEMP_DIR/Code.gs.txt"
printf "User-agent: *\nAllow: /\n" > "$TEMP_DIR/robots.txt"

echo "公開中 → https://${DOMAIN}"
npx --yes surge "$TEMP_DIR" --domain "$DOMAIN"

LOG="$ROOT/../deploy-history.log"
mkdir -p "$(dirname "$LOG")"
touch "$LOG"
echo "$(date '+%Y-%m-%d %H:%M:%S') | https://${DOMAIN}" >> "$LOG"

echo ""
echo "完了: https://${DOMAIN}"
if [[ "$OSTYPE" == "darwin"* ]]; then
  echo "https://${DOMAIN}" | pbcopy
  open "https://${DOMAIN}" || true
fi
