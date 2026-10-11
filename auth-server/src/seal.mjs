// @ts-check
/**
 * Authenticated encryption for the broker's cookies (AES-256-GCM, Web Crypto,
 * so the same code runs on Node, Vercel and Cloudflare Workers).
 *
 * A sealed value is `v1.<base64url(iv | ciphertext+tag)>`. The `purpose` is
 * bound in as additional data, so a value sealed as a sign-in state can never
 * be replayed as a refresh-token cookie, or the other way round.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

/** @param {Uint8Array} bytes */
function toB64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** @param {string} s */
export function fromB64url(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/**
 * Import TOKEN_KEY (32 random bytes, standard base64, e.g. from
 * `openssl rand -base64 32`).
 * @param {string} b64
 */
export async function importKey(b64) {
  let raw;
  try {
    raw = Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0));
  } catch {
    raw = new Uint8Array();
  }
  if (raw.length !== 32) throw new Error("TOKEN_KEY must be 32 bytes, base64-encoded");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/**
 * @param {CryptoKey} key
 * @param {unknown} value  JSON-serializable
 * @param {string} purpose
 */
export async function seal(key, value, purpose) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: enc.encode(purpose) },
      key,
      enc.encode(JSON.stringify(value))
    )
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return `v1.${toB64url(out)}`;
}

/**
 * The value, or null if the token is missing, tampered with, sealed for a
 * different purpose, or sealed with a different key.
 * @param {CryptoKey} key
 * @param {string | undefined} token
 * @param {string} purpose
 * @returns {Promise<any>}
 */
export async function unseal(key, token, purpose) {
  if (!token || !token.startsWith("v1.")) return null;
  try {
    const bytes = fromB64url(token.slice(3));
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: enc.encode(purpose) },
      key,
      bytes.slice(12)
    );
    return JSON.parse(dec.decode(pt));
  } catch {
    return null;
  }
}
