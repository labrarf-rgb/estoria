#!/usr/bin/env bash
#
# Regenerate the raster app icons in public/ from the two SVG sources.
#
#   public/icon.svg           → favicon-32/192/512 (transparent, purpose "any")
#   public/icon-maskable.svg  → maskable-512, apple-touch-icon (opaque paper bg)
#
# The PNGs are committed, so nothing here runs during a build or a deploy — run
# it by hand only when the artwork changes, then commit what it writes.
#
# Why headless Chrome instead of ImageMagick's own SVG support: ImageMagick
# falls back to its internal MSVG renderer when librsvg isn't installed, which
# gets stroke geometry on rotated groups subtly wrong. Chrome is the renderer
# the icons will actually be judged by, so it's the one that rasterizes them.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUBLIC="$ROOT/public"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

command -v magick >/dev/null || { echo "✗ ImageMagick (magick) not found — brew install imagemagick"; exit 1; }
[ -x "$CHROME" ] || { echo "✗ Google Chrome not found at $CHROME"; exit 1; }

# Rasterize an SVG at an exact pixel size. The SVG carries its own width/height,
# so it's wrapped in a page that forces it to fill the screenshot viewport —
# otherwise Chrome renders it at its natural size in a corner of the frame.
render() { # render <svg> <size> <out.png>
  local svg="$1" size="$2" out="$3"
  cat > "$TMP/wrap.html" <<EOF
<style>html,body{margin:0;padding:0;background:transparent}
img{width:${size}px;height:${size}px;display:block}</style>
<img src="file://$svg">
EOF
  "$CHROME" --headless --disable-gpu --allow-file-access-from-files \
    --force-device-scale-factor=1 --default-background-color=00000000 \
    --window-size="$size,$size" --screenshot="$out" "file://$TMP/wrap.html" \
    >/dev/null 2>&1
}

echo "→ Rendering from $PUBLIC/icon.svg"
render "$PUBLIC/icon.svg" 512 "$PUBLIC/icon-512.png"
render "$PUBLIC/icon.svg" 192 "$PUBLIC/icon-192.png"
# 32px is below the point where a fresh render beats a downscale: shrinking the
# 512 lets the outline anti-alias instead of dropping to a 1px hairline.
magick "$PUBLIC/icon-512.png" -resize 32x32 "$PUBLIC/favicon-32.png"

echo "→ Rendering from $PUBLIC/icon-maskable.svg"
render "$PUBLIC/icon-maskable.svg" 512 "$PUBLIC/icon-maskable-512.png"

# Apple's home-screen icon is composited onto its own rounded rect and gets no
# mask beyond that, so it sits between the two: opaque paper background like the
# maskable one, but the card at a fuller 0.85 rather than 0.72.
sed 's/scale(0.72)/scale(0.85)/' "$PUBLIC/icon-maskable.svg" > "$TMP/apple.svg"
render "$TMP/apple.svg" 180 "$PUBLIC/apple-touch-icon.png"

echo "→ Written:"
cd "$PUBLIC" && magick identify icon-512.png icon-192.png favicon-32.png \
  icon-maskable-512.png apple-touch-icon.png | sed 's/^/   /'
