#!/bin/bash
# Build a clean zip for Chrome Web Store upload.
# Run from the duofocus folder: ./build-store-zip.sh

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
  -x "STORE_PRIVACY_COPYPASTE.md" \
  -x "build-store-zip.sh" \
  -x "lockdown-setup.sh" \
  -x "screenshots/*" \
  -x "icons/mascot_old.png" \
  -x "icons/mascot_128.png" \
  -x "duofocus.zip" \
  -x ".claude/*"

echo ""
echo "✓ Created $OUT"
echo ""
echo "Required files in package:"
zip -sf "$OUT" | grep -v "/$" | sort
echo ""
echo "Upload at: https://chrome.google.com/webstore/devconsole"
