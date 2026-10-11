// @ts-check
/**
 * Estoria's sign-in broker (docs/PLAN-drive-sync.md, "The login server").
 *
 * It trades Google sign-in codes for tokens using the client secret, which
 * can't ship in a web page, and keeps the refresh token in an encrypted
 * cookie on the user's own device. Nothing else:
 * - It never sees a manuscript: the browser talks to Drive directly.
 * - It stores nothing: no database, no token at rest outside that cookie.
 * - It never logs codes or tokens.
 *
 * One Web-standard handler (Request → Response), so it runs unchanged on
 * Vercel, Cloudflare Workers, or the local dev server (dev.mjs).
 */

import { readConfig } from "./config.mjs";
import { fromB64url, importKey, seal, unseal } from "./seal.mjs";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE = "https://oauth2.googleapis.com/revoke";
export const DRIVE_FILE = "https://www.googleapis.com/auth/drive.file";
export const SCOPES = `openid email ${DRIVE_FILE}`;

/** Every credentialed call must carry this header: it forces a CORS preflight, so other sites can't fire it. */
export const CALL_HEADER = "x-estoria";

const RT_COOKIE = "estoria_rt";
const STATE_COOKIE = "estoria_state";
const RT_PURPOSE = "refresh-token";
const STATE_PURPOSE = "sign-in-state";
/** The longest browsers keep a cookie. Every refresh re-sets it, so it slides. */
const RT_MAX_AGE = 400 * 24 * 60 * 60;
const STATE_MAX_AGE = 10 * 60;

class GoogleError extends Error {
  /** @param {"invalid_grant" | "rejected" | "unavailable"} kind */
  constructor(kind) {
    super(`Google token endpoint: ${kind}`);
    this.kind = kind;
  }
}

/** @param {string | null} header */
function readCookies(header) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

/** The account email from an ID token received straight from Google over TLS (no signature check needed). */
/** @param {string | undefined} idToken */
function emailFrom(idToken) {
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(String(idToken).split(".")[1])));
    return typeof payload.email === "string" ? payload.email : undefined;
  } catch {
    return undefined;
  }
}

/** @param {string | undefined} scope */
const hasDrive = (scope) => (scope ?? "").split(" ").includes(DRIVE_FILE);

const BASE_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

/**
 * @param {Record<string, string | undefined>} env
 * @param {{ fetch?: typeof fetch, log?: (msg: string) => void }} [deps]
 * @returns {(request: Request) => Promise<Response>}
 */
export function createBroker(env, deps = {}) {
  const fetchImpl = deps.fetch ?? fetch;
  const log = deps.log ?? ((msg) => console.error(msg));

  /** @type {import("./config.mjs").Config | null} */
  let cfg = null;
  try {
    cfg = readConfig(env);
  } catch (e) {
    log(`[broker] ${/** @type {Error} */ (e).message}`);
  }
  /** @type {Promise<CryptoKey> | null} */
  let keyPromise = null;
  const key = () => (keyPromise ??= importKey(/** @type {any} */ (cfg).tokenKey));

  // ---- Responses -------------------------------------------------------------

  /** @param {string | null} origin */
  const corsFor = (origin) =>
    origin && cfg?.allowedOrigins.includes(origin)
      ? {
          "access-control-allow-origin": origin,
          "access-control-allow-credentials": "true",
          vary: "Origin",
        }
      : { vary: "Origin" };

  /**
   * @param {number} status
   * @param {unknown} body
   * @param {{ origin?: string | null, cookies?: string[] }} [opts]
   */
  function json(status, body, opts = {}) {
    const headers = new Headers({
      ...BASE_HEADERS,
      ...corsFor(opts.origin ?? null),
      "content-type": "application/json",
    });
    for (const c of opts.cookies ?? []) headers.append("set-cookie", c);
    return new Response(JSON.stringify(body), { status, headers });
  }

  /** @param {string} location @param {string[]} cookies */
  function redirect(location, cookies) {
    const headers = new Headers({ ...BASE_HEADERS, location });
    for (const c of cookies) headers.append("set-cookie", c);
    return new Response(null, { status: 302, headers });
  }

  /** @param {number} status @param {string} text */
  const plain = (status, text) =>
    new Response(text, { status, headers: { ...BASE_HEADERS, "content-type": "text/plain; charset=utf-8" } });

  /**
   * @param {string} name
   * @param {string} value
   * @param {number} maxAge seconds; 0 clears
   * @param {"Strict" | "Lax"} sameSite
   */
  function cookie(name, value, maxAge, sameSite) {
    const parts = [`${name}=${value}`, "Path=/auth", "HttpOnly", "Secure", `SameSite=${sameSite}`, `Max-Age=${maxAge}`];
    if (cfg?.cookieDomain) parts.push(`Domain=${cfg.cookieDomain}`);
    return parts.join("; ");
  }

  /** @param {{ rt: string, email?: string }} session */
  const sessionCookie = async (session) =>
    cookie(RT_COOKIE, await seal(await key(), session, RT_PURPOSE), RT_MAX_AGE, "Strict");
  const clearSession = () => cookie(RT_COOKIE, "", 0, "Strict");

  // ---- Google ----------------------------------------------------------------

  /** @param {Record<string, string>} params */
  async function googleToken(params) {
    let res;
    try {
      res = await fetchImpl(GOOGLE_TOKEN, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params),
      });
    } catch {
      throw new GoogleError("unavailable");
    }
    /** @type {any} */
    let body = {};
    try {
      body = await res.json();
    } catch {
      // Treated by status below.
    }
    if (res.ok) return body;
    if (body?.error === "invalid_grant") throw new GoogleError("invalid_grant");
    throw new GoogleError(res.status >= 500 ? "unavailable" : "rejected");
  }

  /** Best effort: a failed revoke still ends with the cookie cleared. @param {string | undefined} token */
  async function revoke(token) {
    if (!token) return;
    try {
      await fetchImpl(GOOGLE_REVOKE, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
      });
    } catch {
      // Nothing more to do; Google expires unused grants on its own.
    }
  }

  /**
   * Exchange a sign-in code. Both flows end here: the popup (redirect URI
   * "postmessage") and the full-page redirect used by the iPad home-screen app.
   * @param {string} code
   * @param {string} redirectUri
   */
  async function connect(code, redirectUri) {
    const c = /** @type {import("./config.mjs").Config} */ (cfg);
    const t = await googleToken({
      code,
      client_id: c.clientId,
      client_secret: c.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });
    // Google lets people untick Drive on the consent screen. Without it there
    // is nothing to keep them signed in for, so give the grant straight back.
    if (!hasDrive(t.scope)) {
      await revoke(t.refresh_token ?? t.access_token);
      return /** @type {const} */ ({ error: "drive_scope_missing" });
    }
    if (!t.refresh_token) return /** @type {const} */ ({ error: "no_refresh_token" });
    const email = emailFrom(t.id_token);
    return {
      cookie: await sessionCookie({ rt: t.refresh_token, email }),
      token: { access_token: t.access_token, expires_in: t.expires_in, email, scope: t.scope },
    };
  }

  // ---- Routes ----------------------------------------------------------------

  /** @param {Request} request @param {string | null} origin */
  async function exchange(request, origin) {
    /** @type {any} */
    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: "bad_request" }, { origin });
    }
    if (typeof body?.code !== "string" || !body.code) return json(400, { error: "bad_request" }, { origin });
    try {
      const r = await connect(body.code, "postmessage");
      if ("error" in r) return json(400, { error: r.error }, { origin });
      return json(200, r.token, { origin, cookies: [r.cookie] });
    } catch (e) {
      if (e instanceof GoogleError && e.kind === "unavailable") {
        return json(502, { error: "google_unavailable" }, { origin });
      }
      if (e instanceof GoogleError) return json(400, { error: "code_rejected" }, { origin });
      throw e;
    }
  }

  /** @param {Record<string, string>} cookies @param {string | null} origin */
  async function token(cookies, origin) {
    const session = await unseal(await key(), cookies[RT_COOKIE], RT_PURPOSE);
    if (!session?.rt) {
      return json(401, { error: "not_connected" }, { origin, cookies: cookies[RT_COOKIE] ? [clearSession()] : [] });
    }
    const c = /** @type {import("./config.mjs").Config} */ (cfg);
    let t;
    try {
      t = await googleToken({
        refresh_token: session.rt,
        client_id: c.clientId,
        client_secret: c.clientSecret,
        grant_type: "refresh_token",
      });
    } catch (e) {
      if (e instanceof GoogleError && e.kind === "invalid_grant") {
        // Revoked or expired at Google: the app shows "Reconnect".
        return json(401, { error: "reconnect" }, { origin, cookies: [clearSession()] });
      }
      if (e instanceof GoogleError && e.kind === "unavailable") {
        return json(502, { error: "google_unavailable" }, { origin });
      }
      if (e instanceof GoogleError) return json(500, { error: "broker_rejected" }, { origin });
      throw e;
    }
    const email = emailFrom(t.id_token) ?? session.email;
    return json(
      200,
      { access_token: t.access_token, expires_in: t.expires_in, email, scope: t.scope },
      { origin, cookies: [await sessionCookie({ rt: t.refresh_token ?? session.rt, email })] }
    );
  }

  /** @param {Record<string, string>} cookies @param {string | null} origin */
  async function disconnect(cookies, origin) {
    // Forget this device only. Revoking at Google removes the person's whole
    // grant to the project, which would sign out every other device too
    // (Google: revocation "removes all OAuth 2.0 scopes previously granted to
    // a project"). Removing Estoria everywhere is done at
    // myaccount.google.com/permissions, as the privacy page says.
    void cookies;
    return json(200, { ok: true }, { origin, cookies: [clearSession()] });
  }

  /** Start the full-page sign-in (iPad home-screen app). @param {URL} url */
  async function start(url) {
    const c = /** @type {import("./config.mjs").Config} */ (cfg);
    let back;
    try {
      back = new URL(url.searchParams.get("return") ?? "");
    } catch {
      return json(400, { error: "bad_return" });
    }
    if (!c.allowedOrigins.includes(back.origin)) return json(400, { error: "bad_return" });
    back.hash = "";
    const nonce = crypto.randomUUID();
    const state = await seal(
      await key(),
      { n: nonce, r: back.href, exp: Date.now() + STATE_MAX_AGE * 1000 },
      STATE_PURPOSE
    );
    const google = new URL(GOOGLE_AUTH);
    google.search = new URLSearchParams({
      client_id: c.clientId,
      redirect_uri: `${c.brokerUrl}/auth/callback`,
      response_type: "code",
      scope: SCOPES,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state: nonce,
    }).toString();
    // Lax, not Strict: it has to come back on the top-level navigation from Google.
    return redirect(google.href, [cookie(STATE_COOKIE, state, STATE_MAX_AGE, "Lax")]);
  }

  /** @param {URL} url @param {Record<string, string>} cookies */
  async function callback(url, cookies) {
    const c = /** @type {import("./config.mjs").Config} */ (cfg);
    const st = await unseal(await key(), cookies[STATE_COOKIE], STATE_PURPOSE);
    if (!st || st.exp < Date.now() || st.n !== url.searchParams.get("state")) {
      return plain(400, "This sign-in has expired. Go back to Estoria and press Connect again.");
    }
    const clearState = cookie(STATE_COOKIE, "", 0, "Lax");
    /** @param {string} result @param {string[]} [more] */
    const back = (result, more = []) => redirect(`${st.r}#drive=${result}`, [clearState, ...more]);

    const code = url.searchParams.get("code");
    if (url.searchParams.get("error") || !code) return back("denied");
    try {
      const r = await connect(code, `${c.brokerUrl}/auth/callback`);
      if ("error" in r) return back(r.error === "drive_scope_missing" ? "scope-missing" : "error");
      return back("connected", [r.cookie]);
    } catch (e) {
      if (e instanceof GoogleError) return back(e.kind === "unavailable" ? "unavailable" : "error");
      throw e;
    }
  }

  // ---- Dispatch --------------------------------------------------------------

  return async function handle(request) {
    const url = new URL(request.url);
    // Vercel's rewrite passes the original path along as ?__path.
    const path = (url.searchParams.get("__path") ?? url.pathname).replace(/\/+$/, "") || "/";
    const origin = request.headers.get("origin");
    const route = `${request.method} ${path}`;

    if (path === "/status" && (request.method === "GET" || request.method === "HEAD")) {
      // The kill switch. A broker missing its settings reports "off", so the
      // app pauses Drive rather than failing at every save.
      return json(200, { drive: cfg ? cfg.driveStatus : "off" }, { origin });
    }
    if (!cfg) return json(500, { error: "misconfigured" }, { origin });

    try {
      if (request.method === "OPTIONS") {
        if (!origin || !cfg.allowedOrigins.includes(origin)) return json(403, { error: "forbidden" });
        return new Response(null, {
          status: 204,
          headers: {
            ...BASE_HEADERS,
            ...corsFor(origin),
            "access-control-allow-methods": "GET, POST",
            "access-control-allow-headers": `content-type, ${CALL_HEADER}`,
            "access-control-max-age": "600",
          },
        });
      }

      const cookies = readCookies(request.headers.get("cookie"));
      switch (route) {
        case "GET /auth/start":
          return await start(url);
        case "GET /auth/callback":
          return await callback(url, cookies);
        case "POST /auth/exchange":
        case "POST /auth/token":
        case "POST /auth/disconnect": {
          if (!origin || !cfg.allowedOrigins.includes(origin) || request.headers.get(CALL_HEADER) !== "1") {
            return json(403, { error: "forbidden" });
          }
          if (route === "POST /auth/exchange") return await exchange(request, origin);
          if (route === "POST /auth/token") return await token(cookies, origin);
          return await disconnect(cookies, origin);
        }
      }
      const known = ["/auth/start", "/auth/callback", "/auth/exchange", "/auth/token", "/auth/disconnect"];
      return json(known.includes(path) ? 405 : 404, { error: "not_found" }, { origin });
    } catch (e) {
      // Names only: an error message here never carries a token, but keep the
      // log line boring on purpose.
      log(`[broker] ${route} failed: ${/** @type {Error} */ (e)?.name ?? "error"}`);
      return json(500, { error: "internal" }, { origin });
    }
  };
}
