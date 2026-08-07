#!/usr/bin/env bash
#
# Regenerate the app icons in public/ from Ray's artwork, public/icon-source.png
# (1024×1024, transparent background, soft drop shadow).
#
#   icon-512 / icon-192 / favicon-32   straight downscales — the source is
#                                      already composed with the right margins,
#                                      so nothing is re-cropped or re-centred
#   icon-maskable-512                  inset for the safe zone (see below)
#   apple-touch-icon (180)             less inset
#
# Every one of them is flattened onto the paper background. An app icon is
# never seen on nothing: it sits on a dock, a tab strip, a home screen, a
# taskbar — and a transparent one picks up whatever is behind it, so the card
# reads as a cutout on a dark dock and the drop shadow lands on nothing. The
# cream tile is the icon's own surface, the same paper the board is drawn on.
#
# The PNGs are committed, so this never runs during a build or a deploy — run it
# by hand when the artwork changes, then commit what it writes.
#
# The maskable inset: Android/ChromeOS/macOS crop an installed icon to their own
# shape, and the guaranteed-visible region is the centre 80% circle (radius 205
# of 512). What has to stay inside that circle is the card's *corners*, which
# sit at half the card's diagonal from centre — not the corners of its bounding
# box, which are transparent. At 370px of bounding box that distance is ~196px,
# comfortably inside 205.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUBLIC="$ROOT/public"
SRC="$PUBLIC/icon-source.png"
PAPER="#e9e0cd" # --bg in the light theme

command -v magick >/dev/null || { echo "✗ ImageMagick (magick) not found — brew install imagemagick"; exit 1; }
[ -f "$SRC" ] || { echo "✗ Missing $SRC"; exit 1; }

# `-alpha remove` composites against -background; `-alpha off` then drops the
# now-pointless channel so nothing downstream reintroduces transparency.
flatten=(-background "$PAPER" -alpha remove -alpha off)

echo "→ Downscaling $(basename "$SRC")"
magick "$SRC" -resize 512x512 "${flatten[@]}" "$PUBLIC/icon-512.png"
magick "$SRC" -resize 192x192 "${flatten[@]}" "$PUBLIC/icon-192.png"
magick "$SRC" -resize 32x32 "${flatten[@]}" "$PUBLIC/favicon-32.png"

# -trim measures the artwork itself, so the inset below is a fraction of the
# card rather than of whatever transparent margin the source happens to carry.
echo "→ Compositing the inset variants"
magick "$SRC" -trim +repage -resize 370x370 \
  -background "$PAPER" -gravity center -extent 512x512 "${flatten[@]}" \
  "$PUBLIC/icon-maskable-512.png"

# Apple applies only its own rounded rect, no circular mask, so the card can sit
# fuller in the frame than the maskable version allows.
magick "$SRC" -trim +repage -resize 153x153 \
  -background "$PAPER" -gravity center -extent 180x180 "${flatten[@]}" \
  "$PUBLIC/apple-touch-icon.png"

echo "→ Written:"
cd "$PUBLIC" && magick identify icon-512.png icon-192.png favicon-32.png \
  icon-maskable-512.png apple-touch-icon.png | sed 's/^/   /'
