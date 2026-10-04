#!/usr/bin/env bash
#
# Deploy the webapp to production (www.labrarf.com/estoria) and verify the exact
# committed build is live. The whole point: confirm that the build you approved
# and committed is what your writing environment (prod) is actually serving.
#
# Flow:
#   1. Refuse to deploy a dirty tree — prod must carry a real, clean commit SHA.
#   2. Refuse to overlap another deploy: one at a time on this machine (a lock),
#      and none within SETTLE_MIN minutes of the last one anywhere (see below).
#   3. Build (stamps HEAD's SHA into the app + dist/version.json).
#   4. rsync dist/ into the portfolio repo — **keeping recent builds' assets** —
#      then commit + push it (GitHub Pages).
#   5. Poll until prod reports HEAD's commit AND serves the assets that build's
#      index.html names, or time out.
#
# Why steps 2 and 4 exist (2026-10-04): two deploys landed two minutes apart,
# and the second one's `rsync --delete` removed the first one's script while
# GitHub Pages' CDN (which caches for 600s) was still handing out the first
# one's index.html. Every visitor in that window got a 404 for the app's only
# script and a blank page. Old hashed assets are now kept for KEEP_DEPLOYS
# deploys, so a cached index.html always finds its script, and a deploy waits
# for the previous one's cache window to close. `FORCE=1` skips the wait.
#
set -euo pipefail

WEBAPP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORTFOLIO_DIR="$(cd "$WEBAPP_DIR/../../Portfolio-Website" && pwd)"
SITE_URL="https://www.labrarf.com/estoria"
DEST="$PORTFOLIO_DIR/estoria"
# The CDN's cache lifetime (max-age=600), in minutes: how long an old
# index.html can still be served after the next deploy goes out.
SETTLE_MIN=10
# How many previous deploys' assets stay on the site beside the new one's.
KEEP_DEPLOYS=3

cd "$WEBAPP_DIR"

# 1. Only ever deploy committed code, so the deployed SHA is meaningful.
if [ -n "$(git status --porcelain)" ]; then
  echo "✗ Working tree is dirty. Commit your approved changes first so prod carries a clean commit SHA."
  git status --short
  exit 1
fi

# 2a. One deploy at a time on this machine. The lock lives inside the portfolio
#     repo's .git, so it is shared by every checkout and worktree that deploys
#     through it, and never committed.
LOCK="$PORTFOLIO_DIR/.git/estoria-deploy.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "✗ Another Estoria deploy is running (lock: $LOCK)."
  echo "  If you're sure none is, remove that directory and try again."
  exit 1
fi
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

# 2b. Not within the last deploy's cache window, wherever it came from. Also
#     brings the portfolio checkout up to date, so the push below can't be
#     rejected for being behind.
cd "$PORTFOLIO_DIR"
git fetch -q
if ! git merge --ff-only -q '@{u}' 2>/dev/null; then
  echo "✗ The portfolio repo has diverged from its remote. Reconcile $PORTFOLIO_DIR first."
  exit 1
fi
LAST_DEPLOY="$(git log -1 --format=%ct --grep='^Deploy Estoria' 2>/dev/null || true)"
if [ -n "$LAST_DEPLOY" ] && [ "${FORCE:-0}" != "1" ]; then
  AGE=$(( $(date +%s) - LAST_DEPLOY ))
  if [ "$AGE" -lt $(( SETTLE_MIN * 60 )) ]; then
    WAIT=$(( (SETTLE_MIN * 60 - AGE + 59) / 60 ))
    echo "✗ The last deploy went out $(( AGE / 60 ))m$(( AGE % 60 ))s ago: $(git log -1 --format=%s --grep='^Deploy Estoria')."
    echo "  Wait about ${WAIT}m for its cache window to close, or run with FORCE=1."
    exit 1
  fi
fi
cd "$WEBAPP_DIR"

EXPECTED="$(git rev-parse --short HEAD)"
echo "→ Deploying commit $EXPECTED"

# 3. Build — vite stamps $EXPECTED into the bundle and writes dist/version.json.
npm run build

# 4. Publish. Everything but assets/ mirrors dist/ exactly; assets/ only gains,
#    then is pruned to what this build and the last KEEP_DEPLOYS builds name.
#    (rsync leaves an excluded directory alone under --delete.)
rsync -a --delete --exclude '/assets/' dist/ "$DEST/"
mkdir -p "$DEST/assets"
rsync -a dist/assets/ "$DEST/assets/"

cd "$PORTFOLIO_DIR"
KEEP="$(
  {
    cat "$DEST/index.html"
    for rev in $(git log -n "$KEEP_DEPLOYS" --format=%h -- estoria/index.html); do
      git show "$rev:estoria/index.html" 2>/dev/null || true
    done
  } | grep -oE 'assets/[^"]+' | sed 's#^assets/##' | sort -u || true
)"
for f in "$DEST"/assets/*; do
  [ -e "$f" ] || continue
  grep -qxF "$(basename "$f")" <<<"$KEEP" || rm -f "$f"
done

if [ -n "$(git status --porcelain estoria/)" ]; then
  git add estoria/
  git commit -m "Deploy Estoria $EXPECTED"
  git push
else
  echo "→ Portfolio already in sync (nothing to commit)"
fi

# 5. Verify prod is actually serving this commit (GitHub Pages needs a moment),
#    and that the assets its index.html names load: a version.json that matches
#    beside a script that 404s is exactly the blank page this script exists to
#    rule out.
ASSETS="$(grep -oE 'assets/[^"]+' "$WEBAPP_DIR/dist/index.html" | sort -u || true)"
echo "→ Waiting for $SITE_URL to report $EXPECTED ..."
for i in $(seq 1 30); do
  LIVE="$(curl -fsS "$SITE_URL/version.json?cb=$(date +%s)" 2>/dev/null \
    | grep -o '"commit":"[^"]*"' | cut -d'"' -f4 || true)"
  if [ "$LIVE" = "$EXPECTED" ]; then
    MISSING=""
    for a in $ASSETS; do
      CODE="$(curl -s -o /dev/null -w '%{http_code}' "$SITE_URL/$a" || true)"
      [ "$CODE" = "200" ] || MISSING="$MISSING $a($CODE)"
    done
    if [ -z "$MISSING" ]; then
      echo "✓ $EXPECTED is live at $SITE_URL, and its assets load"
      exit 0
    fi
    echo "  attempt $i/30: $EXPECTED reported, but not yet serving:$MISSING — retrying in 10s"
  else
    echo "  attempt $i/30: prod serving '${LIVE:-?}' — retrying in 10s"
  fi
  sleep 10
done

echo "✗ Timed out: prod never fully served $EXPECTED (GitHub Pages may still be building — check again with: curl $SITE_URL/version.json)."
exit 1
