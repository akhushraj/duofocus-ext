#!/bin/bash
# Build a clean zip for Chrome Web Store upload.
# Run from the duofocus folder: ./build-store-zip.sh
#
# Before replacing extension icons (icon16/48/128), back them up first, e.g.:
#   cp icons/icon16.png icons/icon16.png.bak
#   cp icons/icon48.png icons/icon48.png.bak
#   cp icons/icon128.png icons/icon128.png.bak

set -e
cd "$(dirname "$0")"
OUT=duofocus.zip

rm -f "$OUT"
zip -r "$OUT" . \
  -x "*.DS_Store" \
  -x "_metadata/*" \
  -x ".git/*" \
  -x "*.git*" \
  -x "PUBLISH.md" \
  -x "build-store-zip.sh" \
  -x "icons/mascot_old.png"

echo "Created $OUT - upload this at https://chrome.google.com/webstore/devconsole"
