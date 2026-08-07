#!/usr/bin/env bash
#
# Regenerate the app icons in public/ from Ray's artwork, art/icon-source.png
# (1024×1024, transparent background, soft drop shadow).
#
# The source lives in art/ rather than public/ because everything in public/ is
# copied verbatim into the build — a 450KB master nobody downloads has no
# business being served.
#
#   icon-512 / icon-192 / favicon-32   the card filling the frame, transparent
#   icon-maskable-512                  inset for the safe zone, on paper
#   apple-touch-icon (180)             less inset, on paper
#
# **The card fills the frame.** The source carries a wide transparent margin, so
# a straight downscale leaves the card small and lost in its own canvas — every
# size here is trimmed to the artwork first, then padded back to square. The
# icon is the card, not a card sitting on something.
#
# **Transparent where it's seen as itself; on paper where the platform decides.**
# A dock, a tab strip and a taskbar composite the icon onto their own surface,
# and there the card reads as one object rather than a cream tile with a card
# inside it. But a maskable icon must be full-bleed by spec, and iOS puts solid
# black behind a transparent apple-touch icon — so those two are flattened onto
# the board's paper (#e9e0cd) instead of being left to the platform.
#
# The maskable inset: Android/ChromeOS/macOS crop an installed icon to their own
# shape, and the guaranteed-visible region is the centre 80% circle (radius 205
# of 512). What has to stay inside that circle is the card's *corners*, which
# sit at half the card's diagonal from centre — not the corners of its bounding
# box, which are empty. At 370px of bounding box that distance is ~196px,
# comfortably inside 205.
#
# The PNGs are committed, so this never runs during a build or a deploy — run it
# by hand when the artwork changes, then commit what it writes.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUBLIC="$ROOT/public"
SRC="$ROOT/art/icon-source.png"
PAPER="#e9e0cd" # --bg in the light theme

command -v magick >/dev/null || { echo "✗ ImageMagick (magick) not found — brew install imagemagick"; exit 1; }
[ -f "$SRC" ] || { echo "✗ Missing $SRC"; exit 1; }

# The artwork is slightly wider than it is tall, so squaring it up on the long
# edge keeps the card touching the left and right edges — the crop Ray drew —
# without stretching anything.
SQUARE="$(magick "$SRC" -trim +repage -format "%[fx:max(w,h)]" info:)"
echo "→ Artwork trims to $(magick "$SRC" -trim +repage -format '%wx%h' info:), squared at ${SQUARE}px"

# `-alpha remove` composites against -background; `-alpha off` then drops the
# now-pointless channel so nothing downstream reintroduces transparency.
flatten=(-background "$PAPER" -alpha remove -alpha off)

echo "→ Card-fills-frame sizes (transparent)"
for size in 512 192; do
  magick "$SRC" -trim +repage -background none -gravity center \
    -extent "${SQUARE}x${SQUARE}" -resize "${size}x${size}" \
    "$PUBLIC/icon-${size}.png"
done
magick "$SRC" -trim +repage -background none -gravity center \
  -extent "${SQUARE}x${SQUARE}" -resize 32x32 "$PUBLIC/favicon-32.png"

echo "→ Inset sizes (on paper)"
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
