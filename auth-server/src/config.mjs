// @ts-check
/**
 * The broker's settings, all from the host's environment. Secrets
 * (GOOGLE_CLIENT_SECRET, TOKEN_KEY) live only there: never in the repo, never
 * in a chat. The rest are settings so a domain move is a config change.
 *
 * @typedef {object} Config
 * @property {string} clientId       GOOGLE_CLIENT_ID
 * @property {string} clientSecret   GOOGLE_CLIENT_SECRET
 * @property {string} tokenKey       TOKEN_KEY (base64, 32 bytes)
 * @property {string} brokerUrl      BROKER_URL, e.g. https://auth.labrarf.com (builds the redirect URI)
 * @property {string[]} allowedOrigins ALLOWED_ORIGINS, comma-separated
 * @property {string | undefined} cookieDomain COOKIE_DOMAIN; unset = this host only
 * @property {"on" | "off"} driveStatus DRIVE_STATUS, the kill switch (default on)
 */

const REQUIRED = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "TOKEN_KEY", "BROKER_URL", "ALLOWED_ORIGINS"];

/**
 * @param {Record<string, string | undefined>} env
 * @returns {Config}
 */
export function readConfig(env) {
  const missing = REQUIRED.filter((k) => !env[k]?.trim());
  if (missing.length) throw new Error(`Missing settings: ${missing.join(", ")}`);
  return {
    clientId: /** @type {string} */ (env.GOOGLE_CLIENT_ID).trim(),
    clientSecret: /** @type {string} */ (env.GOOGLE_CLIENT_SECRET).trim(),
    tokenKey: /** @type {string} */ (env.TOKEN_KEY).trim(),
    brokerUrl: /** @type {string} */ (env.BROKER_URL).trim().replace(/\/+$/, ""),
    allowedOrigins: /** @type {string} */ (env.ALLOWED_ORIGINS)
      .split(",")
      .map((s) => s.trim().replace(/\/+$/, ""))
      .filter(Boolean),
    cookieDomain: env.COOKIE_DOMAIN?.trim() || undefined,
    driveStatus: env.DRIVE_STATUS?.trim().toLowerCase() === "off" ? "off" : "on",
  };
}
