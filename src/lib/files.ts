/**
 * Reading a picked image into the document.
 *
 * Everything a writer adds is inlined into `StoryDoc` as a base64 data URL, and
 * base64 costs a third more than the file did. Since the pictures moved to
 * IndexedDB (`store/images.ts`) that no longer threatens the localStorage
 * quota — but the document is still what gets exported, synced to the Estoria
 * folder, and read by the Android app off the same file. A 12-megapixel phone
 * photo dropped in unchanged is ~5.5MB of string in every one of those copies,
 * forever, to be looked at in a 220px card and a lightbox.
 *
 * So pictures are downscaled on the way in. This is the one place it happens,
 * because there are two upload sites (book covers and image assets) and a
 * second copy of this policy would be the one that drifts.
 */

/** Read a picked file as a data URL, exactly as the browser hands it over. */
export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * The longest edge a stored picture may have.
 *
 * 2048 is chosen against the largest surface that ever shows one: the lightbox,
 * which fills 92vw and then zooms 1.6× on click. Smaller would be visibly soft
 * there on a large display; larger buys nothing a reader can see and costs the
 * export, the Sync write and the phone.
 */
export const IMAGE_MAX_EDGE = 2048;

/** Re-encode quality for photographs. */
const JPEG_QUALITY = 0.85;

/**
 * Below this, a picture that is already within `IMAGE_MAX_EDGE` is stored
 * untouched. Re-encoding an image that is already small trades a little
 * quality for nothing — the point of this pass is the multi-megabyte drop, not
 * shaving kilobytes off a screenshot someone pasted in.
 */
const PASSTHROUGH_MAX_BYTES = 1024 * 1024;

/**
 * Formats that must never go through a canvas.
 *
 * An animated GIF would come out as a single frame, and an SVG would be frozen
 * into a bitmap at whatever size we happened to pick — both are silent, lossy
 * conversions of something the writer chose deliberately. They are also both
 * small by nature, which is what makes leaving them alone affordable.
 */
const PASSTHROUGH_TYPES = new Set(["image/gif", "image/svg+xml"]);

/** Formats that can carry transparency, and so must not be re-encoded as JPEG. */
const MAY_HAVE_ALPHA = new Set(["image/png", "image/webp"]);

/**
 * Read a picked image, downscaled to something worth storing.
 *
 * **Never rejects for a downscaling reason.** Every failure below — a format
 * the browser will not decode, a canvas that will not paint, a re-encode that
 * somehow comes out bigger — falls back to the original data URL. Losing the
 * picture the writer just chose would be a far worse outcome than storing it
 * at full size, and this pass is an optimisation, not a gate. A `FileReader`
 * that cannot read the file at all still rejects, because then there is
 * nothing to store either way.
 */
export async function readImageForStorage(file: File): Promise<string> {
  const original = await readFileAsDataURL(file);
  if (PASSTHROUGH_TYPES.has(file.type)) return original;

  try {
    const img = await decode(original);
    const edge = Math.max(img.naturalWidth, img.naturalHeight);
    if (edge === 0) return original;
    if (edge <= IMAGE_MAX_EDGE && file.size <= PASSTHROUGH_MAX_BYTES) return original;

    const scale = Math.min(1, IMAGE_MAX_EDGE / edge);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.drawImage(img, 0, 0, w, h);

    // A transparent PNG re-encoded as JPEG comes back with a black background,
    // so those keep their format even though PNG is the worse choice for a
    // photograph. Only formats that *can* carry alpha are worth the scan.
    const keepAlpha = MAY_HAVE_ALPHA.has(file.type) && hasAlpha(ctx, w, h);
    const out = keepAlpha
      ? canvas.toDataURL("image/png")
      : canvas.toDataURL("image/jpeg", JPEG_QUALITY);

    // A small, already-compressed source can come out bigger than it went in
    // (a flat PNG logo re-encoded as JPEG, say). Keep whichever is smaller.
    return out.length < original.length ? out : original;
  } catch {
    return original;
  }
}

function decode(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("could not decode image"));
    img.src = dataUrl;
  });
}

/** Whether anything drawn is less than fully opaque. */
function hasAlpha(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const { data } = ctx.getImageData(0, 0, w, h);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}
