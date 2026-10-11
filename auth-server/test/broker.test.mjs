// The broker against a fake Google: `npm test` in auth-server/ (node:test, no dependencies).
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { CALL_HEADER, createBroker, DRIVE_FILE } from "../src/broker.mjs";
import { readConfig } from "../src/config.mjs";
import { importKey, seal, unseal } from "../src/seal.mjs";

const KEY = Buffer.alloc(32, 7).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 9).toString("base64");
const APP = "http://localhost:5173";
const BROKER = "http://localhost:3000";
const ENV = {
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  TOKEN_KEY: KEY,
  BROKER_URL: BROKER,
  ALLOWED_ORIGINS: `${APP}, https://www.labrarf.com`,
};

const idToken = (email) =>
  ["h", Buffer.from(JSON.stringify({ email })).toString("base64url"), "sig"].join(".");

/** A scripted Google: queue responses, inspect calls. */
function fakeGoogle() {
  const calls = [];
  const queue = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), params: Object.fromEntries(new URLSearchParams(String(init.body))) });
    const next = queue.shift();
    if (!next) throw new Error("unexpected call to Google");
    if (next === "down") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(next.body ?? {}), { status: next.status ?? 200 });
  };
  return { calls, queue, fetch };
}

let google;
let logs;
let broker;
beforeEach(() => {
  google = fakeGoogle();
  logs = [];
  broker = createBroker(ENV, { fetch: google.fetch, log: (m) => logs.push(m) });
});

const call = (path, { method = "POST", origin = APP, header = true, cookie, body } = {}) => {
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  if (header) headers.set(CALL_HEADER, "1");
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  return broker(
    new Request(`${BROKER}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
};

/** The `name=value` pair of a set-cookie, ready to send back. */
const cookieOf = (res, name) =>
  res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))?.split(";")[0];

const grant = (over = {}) => ({
  body: {
    access_token: "at-1",
    expires_in: 3599,
    refresh_token: "rt-1",
    scope: `openid https://www.googleapis.com/auth/userinfo.email ${DRIVE_FILE}`,
    id_token: idToken("writer@example.com"),
    ...over,
  },
});

async function connected() {
  google.queue.push(grant());
  const res = await call("/auth/exchange", { body: { code: "c" } });
  assert.equal(res.status, 200);
  return cookieOf(res, "estoria_rt");
}

describe("seal", () => {
  it("round-trips, and rejects tampering, another purpose or another key", async () => {
    const key = await importKey(KEY);
    const token = await seal(key, { rt: "secret" }, "a");
    assert.deepEqual(await unseal(key, token, "a"), { rt: "secret" });
    assert.ok(!token.includes("secret"));
    assert.equal(await unseal(key, token, "b"), null);
    assert.equal(await unseal(await importKey(OTHER_KEY), token, "a"), null);
    const flipped = token.slice(0, -2) + (token.at(-2) === "A" ? "B" : "A") + token.at(-1);
    assert.equal(await unseal(key, flipped, "a"), null);
    assert.equal(await unseal(key, undefined, "a"), null);
  });

  it("refuses a key that isn't 32 bytes", async () => {
    await assert.rejects(importKey(Buffer.alloc(16).toString("base64")), /32 bytes/);
    await assert.rejects(importKey("not base64!"), /32 bytes/);
  });
});

describe("config", () => {
  it("names what's missing, never the values", () => {
    assert.throws(() => readConfig({ ...ENV, GOOGLE_CLIENT_SECRET: "" }), /GOOGLE_CLIENT_SECRET/);
  });

  it("reads origins, trims slashes and defaults the kill switch to on", () => {
    const c = readConfig({ ...ENV, BROKER_URL: "https://auth.labrarf.com/", ALLOWED_ORIGINS: "https://a.com/, https://b.com" });
    assert.equal(c.brokerUrl, "https://auth.labrarf.com");
    assert.deepEqual(c.allowedOrigins, ["https://a.com", "https://b.com"]);
    assert.equal(c.driveStatus, "on");
    assert.equal(c.cookieDomain, undefined);
  });
});

describe("/status (kill switch)", () => {
  it("reports on, or off when switched off", async () => {
    assert.deepEqual(await (await call("/status", { method: "GET" })).json(), { drive: "on" });
    broker = createBroker({ ...ENV, DRIVE_STATUS: "off" }, { fetch: google.fetch, log: () => {} });
    assert.deepEqual(await (await call("/status", { method: "GET" })).json(), { drive: "off" });
  });

  it("reports off when the broker is missing its settings, and refuses everything else", async () => {
    broker = createBroker({}, { fetch: google.fetch, log: (m) => logs.push(m) });
    assert.deepEqual(await (await call("/status", { method: "GET" })).json(), { drive: "off" });
    assert.equal((await call("/auth/token")).status, 500);
    assert.match(logs.join("\n"), /Missing settings/);
  });

  it("is readable from Estoria's pages", async () => {
    const res = await call("/status", { method: "GET" });
    assert.equal(res.headers.get("access-control-allow-origin"), APP);
  });
});

describe("who may call", () => {
  it("answers the preflight for Estoria's origins only", async () => {
    const ok = await call("/auth/token", { method: "OPTIONS" });
    assert.equal(ok.status, 204);
    assert.equal(ok.headers.get("access-control-allow-origin"), APP);
    assert.equal(ok.headers.get("access-control-allow-credentials"), "true");
    assert.match(ok.headers.get("access-control-allow-headers"), new RegExp(CALL_HEADER));
    assert.equal((await call("/auth/token", { method: "OPTIONS", origin: "https://evil.example" })).status, 403);
  });

  it("refuses calls from other sites, or without the custom header", async () => {
    assert.equal((await call("/auth/token", { origin: "https://evil.example" })).status, 403);
    assert.equal((await call("/auth/token", { origin: null })).status, 403);
    assert.equal((await call("/auth/token", { header: false })).status, 403);
    assert.equal(google.calls.length, 0);
  });

  it("404s unknown paths and 405s wrong methods", async () => {
    assert.equal((await call("/nope")).status, 404);
    assert.equal((await call("/auth/token", { method: "GET" })).status, 405);
  });

  it("routes Vercel's rewritten path", async () => {
    const res = await broker(new Request(`${BROKER}/api/broker?__path=/status`));
    assert.deepEqual(await res.json(), { drive: "on" });
  });
});

describe("POST /auth/exchange (popup sign-in)", () => {
  it("trades the code, keeps the refresh token only in a sealed cookie", async () => {
    google.queue.push(grant());
    const res = await call("/auth/exchange", { body: { code: "the-code" } });
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.deepEqual(body, {
      access_token: "at-1",
      expires_in: 3599,
      email: "writer@example.com",
      scope: grant().body.scope,
    });

    const [set] = res.headers.getSetCookie();
    assert.match(set, /^estoria_rt=v1\./);
    for (const attr of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/auth", `Max-Age=${400 * 86400}`]) {
      assert.ok(set.includes(attr), `cookie has ${attr}`);
    }
    assert.ok(!set.includes("rt-1"), "refresh token is not readable in the cookie");
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.headers.get("access-control-allow-origin"), APP);

    assert.equal(google.calls[0].url, "https://oauth2.googleapis.com/token");
    assert.deepEqual(google.calls[0].params, {
      code: "the-code",
      client_id: "client-id",
      client_secret: "client-secret",
      redirect_uri: "postmessage",
      grant_type: "authorization_code",
    });
  });

  it("refuses when Google gave no refresh token, and sets no cookie", async () => {
    google.queue.push(grant({ refresh_token: undefined }));
    const res = await call("/auth/exchange", { body: { code: "c" } });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "no_refresh_token" });
    assert.equal(res.headers.getSetCookie().length, 0);
  });

  it("gives the grant back when the person unticked Drive", async () => {
    google.queue.push(grant({ scope: "openid email" }), { body: {} });
    const res = await call("/auth/exchange", { body: { code: "c" } });
    assert.deepEqual(await res.json(), { error: "drive_scope_missing" });
    assert.equal(google.calls[1].url, "https://oauth2.googleapis.com/revoke");
    assert.equal(google.calls[1].params.token, "rt-1");
    assert.equal(res.headers.getSetCookie().length, 0);
  });

  it("maps Google's answers: bad code → 400, Google down → 502", async () => {
    google.queue.push({ status: 400, body: { error: "invalid_grant" } });
    assert.deepEqual(await (await call("/auth/exchange", { body: { code: "c" } })).json(), { error: "code_rejected" });
    google.queue.push("down");
    assert.equal((await call("/auth/exchange", { body: { code: "c" } })).status, 502);
    google.queue.push({ status: 503 });
    assert.equal((await call("/auth/exchange", { body: { code: "c" } })).status, 502);
  });

  it("rejects a malformed body", async () => {
    assert.equal((await call("/auth/exchange", { body: {} })).status, 400);
    assert.equal(google.calls.length, 0);
  });
});

describe("POST /auth/token (staying signed in)", () => {
  it("is 401 not_connected without a cookie", async () => {
    const res = await call("/auth/token");
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "not_connected" });
  });

  it("refreshes quietly and slides the cookie forward", async () => {
    const session = await connected();
    google.queue.push({ body: { access_token: "at-2", expires_in: 3599, scope: DRIVE_FILE } });
    const res = await call("/auth/token", { cookie: session });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      access_token: "at-2",
      expires_in: 3599,
      email: "writer@example.com",
      scope: DRIVE_FILE,
    });
    assert.deepEqual(google.calls.at(-1).params, {
      refresh_token: "rt-1",
      client_id: "client-id",
      client_secret: "client-secret",
      grant_type: "refresh_token",
    });
    assert.ok(cookieOf(res, "estoria_rt"), "cookie re-set");
  });

  it("adopts a rotated refresh token", async () => {
    const session = await connected();
    google.queue.push({ body: { access_token: "at-2", expires_in: 3599, refresh_token: "rt-2" } });
    const next = cookieOf(await call("/auth/token", { cookie: session }), "estoria_rt");
    google.queue.push({ body: { access_token: "at-3", expires_in: 3599 } });
    await call("/auth/token", { cookie: next });
    assert.equal(google.calls.at(-1).params.refresh_token, "rt-2");
  });

  it("clears the cookie and asks to reconnect when Google revoked the grant", async () => {
    const session = await connected();
    google.queue.push({ status: 400, body: { error: "invalid_grant" } });
    const res = await call("/auth/token", { cookie: session });
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "reconnect" });
    assert.match(res.headers.getSetCookie()[0], /^estoria_rt=; .*Max-Age=0/);
  });

  it("keeps the cookie when Google is just unreachable", async () => {
    const session = await connected();
    google.queue.push("down");
    const res = await call("/auth/token", { cookie: session });
    assert.equal(res.status, 502);
    assert.equal(res.headers.getSetCookie().length, 0);
  });

  it("treats a tampered or foreign cookie as not connected, and clears it", async () => {
    const session = await connected();
    const res = await call("/auth/token", { cookie: `${session}x` });
    assert.equal(res.status, 401);
    assert.match(res.headers.getSetCookie()[0], /Max-Age=0/);

    const otherBroker = createBroker({ ...ENV, TOKEN_KEY: OTHER_KEY }, { fetch: google.fetch, log: () => {} });
    const foreign = await otherBroker(
      new Request(`${BROKER}/auth/token`, {
        method: "POST",
        headers: { origin: APP, [CALL_HEADER]: "1", cookie: session },
      })
    );
    assert.equal(foreign.status, 401);
  });
});

describe("POST /auth/disconnect", () => {
  it("forgets this device only: clears the cookie, never revokes at Google", async () => {
    // A revoke removes the whole grant, signing out every other device.
    const session = await connected();
    const before = google.calls.length;
    const res = await call("/auth/disconnect", { cookie: session });
    assert.equal(res.status, 200);
    assert.equal(google.calls.length, before);
    assert.match(res.headers.getSetCookie()[0], /^estoria_rt=; .*Max-Age=0/);
  });

  it("clears the cookie when there is no sign-in", async () => {
    const res = await call("/auth/disconnect");
    assert.equal(res.status, 200);
    assert.equal(google.calls.length, 0);
  });
});

describe("redirect sign-in (iPad home-screen app)", () => {
  const start = (ret) => call(`/auth/start?return=${encodeURIComponent(ret)}`, { method: "GET", origin: null, header: false });

  it("only returns to Estoria's own pages", async () => {
    assert.equal((await start("https://evil.example/")).status, 400);
    assert.equal((await start("not a url")).status, 400);
  });

  it("sends the browser to Google with a sealed, short-lived state", async () => {
    const res = await start(`${APP}/?x=1#old`);
    assert.equal(res.status, 302);
    const to = new URL(res.headers.get("location"));
    assert.equal(to.origin + to.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
    const p = Object.fromEntries(to.searchParams);
    assert.equal(p.client_id, "client-id");
    assert.equal(p.redirect_uri, `${BROKER}/auth/callback`);
    assert.equal(p.access_type, "offline");
    assert.equal(p.prompt, "consent");
    assert.equal(p.scope, `openid email ${DRIVE_FILE}`);
    const set = res.headers.getSetCookie()[0];
    assert.match(set, /^estoria_state=v1\..*SameSite=Lax.*Max-Age=600/);
  });

  async function roundTrip(callbackQuery) {
    const res = await start(`${APP}/`);
    const state = new URL(res.headers.get("location")).searchParams.get("state");
    const cookie = cookieOf(res, "estoria_state");
    return call(`/auth/callback?${callbackQuery(state)}`, { method: "GET", origin: null, header: false, cookie });
  }

  it("connects and returns to the app with nothing sensitive in the URL", async () => {
    google.queue.push(grant());
    const res = await roundTrip((s) => `code=the-code&state=${s}`);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), `${APP}/#drive=connected`);
    assert.ok(cookieOf(res, "estoria_rt"));
    assert.match(res.headers.getSetCookie().find((c) => c.startsWith("estoria_state=")), /Max-Age=0/);
    assert.equal(google.calls[0].params.redirect_uri, `${BROKER}/auth/callback`);
  });

  it("refuses a state that doesn't match its cookie", async () => {
    const res = await roundTrip(() => "code=c&state=forged");
    assert.equal(res.status, 400);
    assert.equal(google.calls.length, 0);
  });

  it("returns 'denied' when the person cancels at Google", async () => {
    const res = await roundTrip((s) => `error=access_denied&state=${s}`);
    assert.equal(res.headers.get("location"), `${APP}/#drive=denied`);
  });

  it("returns 'scope-missing' when Drive was unticked", async () => {
    google.queue.push(grant({ scope: "openid email" }), { body: {} });
    const res = await roundTrip((s) => `code=c&state=${s}`);
    assert.equal(res.headers.get("location"), `${APP}/#drive=scope-missing`);
    assert.equal(cookieOf(res, "estoria_rt"), undefined);
  });
});

describe("logging", () => {
  it("never writes codes or tokens to the log", async () => {
    await connected();
    google.queue.push({ status: 400, body: { error: "invalid_grant" } });
    await call("/auth/exchange", { body: { code: "secret-code" } });
    const all = logs.join("\n");
    for (const s of ["secret-code", "rt-1", "at-1", "client-secret"]) assert.ok(!all.includes(s));
  });
});
