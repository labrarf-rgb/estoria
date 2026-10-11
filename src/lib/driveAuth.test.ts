import { beforeEach, describe, expect, it } from "vitest";
import { createDriveAuth } from "@/lib/driveAuth";
import { DriveConnectError, DriveOfflineError, DriveReconnectError } from "@/lib/driveErrors";
import { _setDriveStatusForTests, drivePaused, refreshDriveStatus } from "@/lib/syncTarget";

/** Staying signed in: the page's side of the broker (in-memory token, early refresh, the three failure states). */

type Reply = { status: number; body?: unknown } | "network-error";

let now: number;
let replies: Reply[];
let calls: Array<{ url: string; init?: RequestInit }>;

function auth() {
  return createDriveAuth({
    brokerUrl: "https://auth.example",
    now: () => now,
    fetch: async (input, init) => {
      calls.push({ url: String(input), init });
      const r = replies.shift();
      if (!r) throw new Error("no scripted reply");
      if (r === "network-error") throw new TypeError("Failed to fetch");
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
    },
  });
}

const token = (value: string, email = "writer@example.com") => ({
  status: 200,
  body: { access_token: value, expires_in: 3600, email, scope: "https://www.googleapis.com/auth/drive.file" },
});

beforeEach(() => {
  now = 1_000_000;
  replies = [];
  calls = [];
});

describe("getAccessToken", () => {
  it("asks the broker with the cookie and the custom header, then reuses the token", async () => {
    const a = auth();
    replies.push(token("at-1"));
    expect(await a.getAccessToken()).toBe("at-1");
    expect(await a.getAccessToken()).toBe("at-1");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://auth.example/auth/token");
    expect(calls[0].init).toMatchObject({ method: "POST", credentials: "include" });
    expect((calls[0].init?.headers as Record<string, string>)["x-estoria"]).toBe("1");
    expect(a.status()).toEqual({ state: "connected", email: "writer@example.com" });
    expect(a.connectedEmail()).toBe("writer@example.com");
  });

  it("refreshes about 5 minutes before expiry, quietly", async () => {
    const a = auth();
    replies.push(token("at-1"), token("at-2"));
    await a.getAccessToken();
    now += 54 * 60 * 1000;
    expect(await a.getAccessToken()).toBe("at-1");
    now += 2 * 60 * 1000; // 4 minutes left
    expect(await a.getAccessToken()).toBe("at-2");
  });

  it("makes one broker call however many requests are waiting", async () => {
    const a = auth();
    replies.push(token("at-1"));
    const all = await Promise.all([a.getAccessToken(), a.getAccessToken(), a.getAccessToken()]);
    expect(all).toEqual(["at-1", "at-1", "at-1"]);
    expect(calls).toHaveLength(1);
  });

  it("fetches a new one after Drive said 401", async () => {
    const a = auth();
    replies.push(token("at-1"), token("at-2"));
    await a.getAccessToken();
    a.invalidateAccessToken();
    expect(await a.getAccessToken()).toBe("at-2");
  });

  it("tells 'never connected' from 'needs reconnecting'", async () => {
    const a = auth();
    replies.push({ status: 401, body: { error: "not_connected" } });
    const first = await a.getAccessToken().catch((e) => e);
    expect(first).toBeInstanceOf(DriveReconnectError);
    expect((first as DriveReconnectError).reason).toBe("not-connected");
    expect(a.status().state).toBe("not-connected");

    const b = auth();
    replies.push({ status: 401, body: { error: "reconnect" } });
    const second = await b.getAccessToken().catch((e) => e);
    expect((second as DriveReconnectError).reason).toBe("revoked");
    expect(b.status().state).toBe("reconnect");
  });

  it("stops asking the broker once it knows this device is signed out", async () => {
    const a = auth();
    replies.push({ status: 401, body: { error: "not_connected" } });
    await expect(a.getAccessToken()).rejects.toBeInstanceOf(DriveReconnectError);
    await expect(a.getAccessToken()).rejects.toBeInstanceOf(DriveReconnectError);
    expect(calls).toHaveLength(1);
  });

  it("is offline, not signed out, when the broker or Google can't be reached", async () => {
    const a = auth();
    replies.push("network-error", { status: 502, body: { error: "google_unavailable" } });
    await expect(a.getAccessToken()).rejects.toBeInstanceOf(DriveOfflineError);
    await expect(a.getAccessToken()).rejects.toBeInstanceOf(DriveOfflineError);
    expect(a.status().state).toBe("offline");
  });

  it("tells listeners when the state changes", async () => {
    const a = auth();
    const seen: string[] = [];
    a.onStatus((s) => seen.push(s.state));
    replies.push(token("at-1"));
    await a.getAccessToken();
    expect(seen).toEqual(["connected"]);
  });
});

describe("connecting and disconnecting", () => {
  it("trades the popup's code and is then signed in", async () => {
    const a = auth();
    replies.push(token("at-1", "new@example.com"));
    expect(await a.exchangeCode("the-code")).toEqual({ email: "new@example.com" });
    expect(calls[0].url).toBe("https://auth.example/auth/exchange");
    expect(calls[0].init?.body).toBe('{"code":"the-code"}');
    expect(await a.getAccessToken()).toBe("at-1");
  });

  it("explains a connect the person can fix", async () => {
    const a = auth();
    replies.push({ status: 400, body: { error: "drive_scope_missing" } });
    const err = await a.exchangeCode("c").catch((e) => e);
    expect(err).toBeInstanceOf(DriveConnectError);
    expect((err as DriveConnectError).reason).toBe("drive-scope-missing");
  });

  it("disconnects at the broker and forgets the token", async () => {
    const a = auth();
    replies.push(token("at-1"), { status: 200, body: { ok: true } }, { status: 401, body: { error: "not_connected" } });
    await a.getAccessToken();
    await a.disconnect();
    expect(calls[1].url).toBe("https://auth.example/auth/disconnect");
    expect(a.status().state).toBe("not-connected");
    await expect(a.getAccessToken()).rejects.toBeInstanceOf(DriveReconnectError);
  });

  it("builds the full-page sign-in address", () => {
    expect(auth().redirectSignInUrl("https://www.labrarf.com/estoria/")).toBe(
      "https://auth.example/auth/start?return=https%3A%2F%2Fwww.labrarf.com%2Festoria%2F"
    );
  });
});

describe("kill switch", () => {
  it("pauses until the broker has said 'on', and pauses again on 'off'", async () => {
    _setDriveStatusForTests("unknown");
    expect(drivePaused()).toBe(true);
    await refreshDriveStatus({ fetchDriveStatus: async () => "on" });
    expect(drivePaused()).toBe(false);
    await refreshDriveStatus({ fetchDriveStatus: async () => "off" });
    expect(drivePaused()).toBe(true);
  });

  it("stays paused when the broker is unreachable at startup", async () => {
    _setDriveStatusForTests("unknown");
    await refreshDriveStatus({ fetchDriveStatus: async () => "unreachable" });
    expect(drivePaused()).toBe(true);
  });

  it("keeps Drive on through a later blip (that's offline, not a pause)", async () => {
    _setDriveStatusForTests("on");
    await refreshDriveStatus({ fetchDriveStatus: async () => "unreachable" });
    expect(drivePaused()).toBe(false);
  });

  it("reads the broker's answer", async () => {
    const a = auth();
    replies.push({ status: 200, body: { drive: "off" } }, "network-error");
    expect(await a.fetchDriveStatus()).toBe("off");
    expect(await a.fetchDriveStatus()).toBe("unreachable");
  });
});
