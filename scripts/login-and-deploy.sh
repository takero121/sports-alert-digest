#!/bin/bash
set -e
export PATH="$HOME/.nvm/versions/node/v24.14.0/bin:$PATH"
cd "$(dirname "$0")/.."
echo "Surge にログインします（メールとパスワードを入力）"
npx --yes surge login
bash scripts/deploy-surge.sh
