#!/usr/bin/env bash
# Installs the headless Chrome used by the tests, into ./.cache (no root needed).
#   bash tools/setup-chrome.sh   then   npm run test:all
set -e
cd "$(dirname "$0")/.."
npx --yes puppeteer browsers install chrome
python3 tools/fetch-chrome-libs.py
echo
echo "Ready. Run the tests with:"
echo "  LD_LIBRARY_PATH=$(pwd)/.cache/chromelibs npm run test:all"
