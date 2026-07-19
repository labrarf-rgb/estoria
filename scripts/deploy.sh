#!/usr/bin/env bash
#
# Deploy the webapp to production (www.labrarf.com/estoria) and verify the exact
# committed build is live. The whole point: confirm that the build you approved
# and committed is what your writing environment (prod) is actually serving.
#
# Flow:
#   1. Refuse to deploy a dirty tree — prod must carry a real, clean commit SHA.
#   2. Build (stamps HEAD's SHA into the app + dist/version.json).
#   3. rsync dist/ into the portfolio repo, then commit + push it (GitHub Pages).
#   4. Poll /estoria/version.json until prod reports HEAD's commit, or time out.
#
set -euo pipefail

WEBAPP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORTFOLIO_DIR="$(cd "$WEBAPP_DIR/../../Portfolio-Website" && pwd)"
SITE_URL="https://www.labrarf.com/estoria"

cd "$WEBAPP_DIR"

# 1. Only ever deploy committed code, so the deployed SHA is meaningful.
if [ -n "$(git status --porcelain)" ]; then
  echo "✗ Working tree is dirty. Commit your approved changes first so prod carries a clean commit SHA."
  git status --short
  exit 1
fi

EXPECTED="$(git rev-parse --short HEAD)"
echo "→ Deploying commit $EXPECTED"

# 2. Build — vite stamps $EXPECTED into the bundle and writes dist/version.json.
npm run build

# 3. Publish: sync into the portfolio repo, then commit + push it.
rsync -a --delete dist/ "$PORTFOLIO_DIR/estoria/"

cd "$PORTFOLIO_DIR"
if [ -n "$(git status --porcelain estoria/)" ]; then
  git add estoria/
  git commit -m "Deploy Estoria $EXPECTED"
  git push
else
  echo "→ Portfolio already in sync (nothing to commit)"
fi

# 4. Verify prod is actually serving this commit (GitHub Pages needs a moment).
echo "→ Waiting for $SITE_URL to report $EXPECTED ..."
for i in $(seq 1 30); do
  LIVE="$(curl -fsS "$SITE_URL/version.json?cb=$(date +%s%N)" 2>/dev/null \
    | grep -o '"commit":"[^"]*"' | cut -d'"' -f4 || true)"
  if [ "$LIVE" = "$EXPECTED" ]; then
    echo "✓ $EXPECTED is live at $SITE_URL"
    exit 0
  fi
  echo "  attempt $i/30: prod serving '${LIVE:-?}' — retrying in 10s"
  sleep 10
done

echo "✗ Timed out: prod never reported $EXPECTED (GitHub Pages may still be building — re-run to re-check)."
exit 1
