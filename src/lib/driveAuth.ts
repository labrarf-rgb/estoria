import { DRIVE_CONFIG } from "@/lib/driveConfig";
import { DriveConnectError, DriveOfflineError, DriveReconnectError } from "@/lib/driveErrors";

/**
 * Staying signed in to Google Drive (docs/PLAN-drive-sync.md, "Sign-in flow in
 * the app"). The refresh token never reaches this page: it sits in the
 * broker's encrypted, HttpOnly cookie. This module holds only a short-lived
 * access token, **in memory only** (never localStorage), and asks the broker
 * for a fresh one about 5 minutes before it expires, or after any 401 from
 * Drive. That is a plain fetch: no popup, no click, so it works in the
 * background on every browser.
 *
 * Connecting is the one step that needs a click (the Google sign-in popup, or
 * a full-page redirect on an iPad home-screen app); that UI lives with the
 * Connect button and hands its code to `exchangeCode`.
 */

/** Refresh this long before Google's expiry, so a request never races it. */
const EARLY_REFRESH_MS = 5 * 60 * 1000;

export type DriveAuthStatus =
  | { state: "unknown" }
  | { state: "connected"; email?: string }
  | { state: "not-connected" }
  | { state: "reconnect" }
  | { state: "offline" };

export interface DriveAuthDeps {
  fetch: typeof fetch;
  now: () => number;
  brokerUrl: string;
}

interface AccessToken {
  value: string;
  expiresAt: number;
  email?: string;
  scope?: string;
}

/** The broker's reply to a token request. */
interface TokenReply {
  access_token: string;
  expires_in: number;
  email?: string;
  scope?: string;
}

export function createDriveAuth(deps: DriveAuthDeps) {
  let token: AccessToken | null = null;
  let inflight: Promise<string> | null = null;
  let status: DriveAuthStatus = { state: "unknown" };
  const listeners = new Set<(s: DriveAuthStatus) => void>();

  function setStatus(next: DriveAuthStatus) {
    status = next;
    for (const fn of listeners) fn(next);
  }

  async function broker(path: string, body?: unknown): Promise<Response> {
    try {
      return await deps.fetch(`${deps.brokerUrl}${path}`, {
        method: "POST",
        credentials: "include",
        headers: {
          // Forces a CORS preflight, so no other site can make these calls.
          "x-estoria": "1",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new DriveOfflineError();
    }
  }

  function adopt(reply: TokenReply): string {
    token = {
      value: reply.access_token,
      expiresAt: deps.now() + reply.expires_in * 1000,
      email: reply.email,
      scope: reply.scope,
    };
    setStatus({ state: "connected", email: reply.email });
    return token.value;
  }

  async function refresh(): Promise<string> {
    let res: Response;
    try {
      res = await broker("/auth/token");
    } catch (e) {
      setStatus({ state: "offline" });
      throw e;
    }
    const body = (await res.json().catch(() => ({}))) as Partial<TokenReply> & { error?: string };
    if (res.ok && body.access_token) return adopt(body as TokenReply);
    if (res.status === 401) {
      token = null;
      const revoked = body.error === "reconnect";
      setStatus(revoked ? { state: "reconnect" } : { state: "not-connected" });
      throw new DriveReconnectError(revoked ? "revoked" : "not-connected");
    }
    // 502 (Google unreachable from the broker), 500, or anything odd: try again later.
    setStatus({ state: "offline" });
    throw new DriveOfflineError();
  }

  return {
    /** A valid access token, refreshed quietly through the broker when due. */
    getAccessToken(): Promise<string> {
      if (token && token.expiresAt - deps.now() > EARLY_REFRESH_MS) return Promise.resolve(token.value);
      // Known to be signed out: don't ask the broker again on every save.
      // Connecting reloads the page, which starts this fresh.
      if (status.state === "not-connected" || status.state === "reconnect") {
        return Promise.reject(new DriveReconnectError(status.state === "reconnect" ? "revoked" : "not-connected"));
      }
      // One refresh at a time, however many requests are waiting on it.
      inflight ??= refresh().finally(() => {
        inflight = null;
      });
      return inflight;
    },

    /** Drop the in-memory token (Drive answered 401), so the next call refreshes. */
    invalidateAccessToken(): void {
      token = null;
    },

    /** Finish a popup sign-in: trade Google's one-time code at the broker. */
    async exchangeCode(code: string): Promise<{ email?: string }> {
      const res = await broker("/auth/exchange", { code });
      const body = (await res.json().catch(() => ({}))) as Partial<TokenReply> & { error?: string };
      if (res.ok && body.access_token) {
        adopt(body as TokenReply);
        return { email: body.email };
      }
      if (res.status === 502) throw new DriveOfflineError();
      throw new DriveConnectError(
        body.error === "drive_scope_missing"
          ? "drive-scope-missing"
          : body.error === "no_refresh_token"
            ? "no-refresh-token"
            : "failed"
      );
    },

    /** Revoke at Google and forget the sign-in on this device. */
    async disconnect(): Promise<void> {
      token = null;
      try {
        await broker("/auth/disconnect");
      } finally {
        setStatus({ state: "not-connected" });
      }
    },

    /** Where to send the page for the full-page sign-in (iPad home-screen app, H6). */
    redirectSignInUrl(returnTo: string): string {
      return `${deps.brokerUrl}/auth/start?return=${encodeURIComponent(returnTo)}`;
    },

    /** The account this device is signed in with, once known. */
    connectedEmail(): string | undefined {
      return token?.email;
    },

    status(): DriveAuthStatus {
      return status;
    },

    onStatus(fn: (s: DriveAuthStatus) => void): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** The kill switch (`/status`): "unreachable" counts as paused at startup. */
    async fetchDriveStatus(): Promise<"on" | "off" | "unreachable"> {
      try {
        const res = await deps.fetch(`${deps.brokerUrl}/status`, { credentials: "omit" });
        const body = (await res.json()) as { drive?: string };
        return body.drive === "on" ? "on" : "off";
      } catch {
        return "unreachable";
      }
    },
  };
}

export type DriveAuth = ReturnType<typeof createDriveAuth>;

/** This page's sign-in state. */
export const driveAuth: DriveAuth = createDriveAuth({
  fetch: (...args) => fetch(...args),
  now: () => Date.now(),
  brokerUrl: DRIVE_CONFIG.brokerUrl,
});

/**
 * After a full-page sign-in the broker returns here with `#drive=<result>`
 * ("connected", "denied", "scope-missing", "error", "unavailable"). Read it
 * once and take it off the address bar.
 */
export function consumeRedirectResult(): string | null {
  const m = /^#drive=([a-z-]+)$/.exec(location.hash);
  if (!m) return null;
  history.replaceState(history.state, "", location.pathname + location.search);
  return m[1];
}
