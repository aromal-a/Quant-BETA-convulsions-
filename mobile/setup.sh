#!/usr/bin/env bash
# One-time setup: creates package.json for the current Expo SDK, installs native modules.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f package.json ]; then
  npx create-expo-app@latest _tmp --template blank --no-install --yes
  cp _tmp/package.json _tmp/index.js .
  rm -rf _tmp
  sed -i '' 's/"name": "_tmp"/"name": "quant-beam-mobile"/' package.json 2>/dev/null || true
fi

npm install
npx expo install @supabase/supabase-js expo-secure-store react-native-url-polyfill react-native-svg \
  react-native-safe-area-context expo-apple-authentication expo-web-browser expo-linking expo-status-bar expo-constants
npm install js-sha256

[ -f .env ] || cp .env.example .env
echo
echo "Done. Fill in mobile/.env, then run: npx expo start"
