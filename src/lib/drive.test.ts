import { beforeEach, describe, expect, it } from "vitest";
import { createDrive, RESUMABLE_OVER } from "@/lib/drive";
import { DriveOfflineError, DriveRequestError } from "@/lib/driveErrors";

/** The Drive v3 HTTP layer: request shapes, retries and backoff (H14), uploads (H13), no blind create retries (H2c). */

type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | "network-error";

let replies: Reply[];
let requests: Array<{ url: string; method: string; headers: Record<string, string>; body?: string }>;
let sleeps: number[];
let tokens: string[];
let invalidations: number;

function api() {
  return createDrive({
    fetch: async (input, init) => {
      requests.push({
        url: String(input),
        method: init?.method ?? "GET",
        headers: (init?.headers ?? {}) as Record<string, string>,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      const r = replies.shift();
      if (!r) throw new Error("no scripted reply");
      if (r === "network-error") throw new TypeError("Failed to fetch");
      return new Response(typeof r.body === "string" ? r.body : JSON.stringify(r.body ?? {}), {
        status: r.status,
        headers: r.headers,
      });
    },
    getToken: async () => tokens[Math.min(invalidations, tokens.length - 1)],
    invalidateToken: () => void invalidations++,
    sleep: async (ms) => void sleeps.push(ms),
  });
}

beforeEach(() => {
  replies = [];
  requests = [];
  sleeps = [];
  tokens = ["t1", "t2"];
  invalidations = 0;
});

const params = (url: string) => new URL(url).searchParams;

describe("requests", () => {
  it("lists a folder's files, quoting names safely and following pages", async () => {
    replies.push(
      { status: 200, body: { files: [{ id: "a", name: "x" }], nextPageToken: "p2" } },
      { status: 200, body: { files: [{ id: "b", name: "x" }] } }
    );
    const files = await api().list({ parent: "folder1", name: "it's \\ here.estoria.json" });
    expect(files.map((f) => f.id)).toEqual(["a", "b"]);
    expect(params(requests[0].url).get("q")).toBe(
      "'folder1' in parents and trashed = false and name = 'it\\'s \\\\ here.estoria.json'"
    );
    expect(params(requests[1].url).get("pageToken")).toBe("p2");
    expect(requests[0].headers.authorization).toBe("Bearer t1");
  });

  it("returns null for a file Estoria can't see", async () => {
    replies.push({ status: 404, body: { error: { errors: [{ reason: "notFound" }] } } });
    expect(await api().get("gone")).toBeNull();
  });

  it("creates a small file with one multipart upload", async () => {
    replies.push({ status: 200, body: { id: "new", name: "a.estoria.json" } });
    const f = await api().create("folder1", "a.estoria.json", '{"x":1}');
    expect(f.id).toBe("new");
    expect(requests[0].method).toBe("POST");
    expect(params(requests[0].url).get("uploadType")).toBe("multipart");
    expect(requests[0].headers["content-type"]).toMatch(/^multipart\/related; boundary=/);
    expect(requests[0].body).toContain('"parents":["folder1"]');
    expect(requests[0].body).toContain('{"x":1}');
  });

  it("uploads anything over 4 MB through a resumable session (H13)", async () => {
    const big = "x".repeat(RESUMABLE_OVER + 1);
    replies.push(
      { status: 200, headers: { location: "https://upload.example/session-1" } },
      { status: 200, body: { id: "big", name: "a.estoria.json" } }
    );
    await api().create("folder1", "a.estoria.json", big);
    expect(params(requests[0].url).get("uploadType")).toBe("resumable");
    expect(requests[1]).toMatchObject({ url: "https://upload.example/session-1", method: "PUT" });
    expect(requests[1].body?.length).toBe(big.length);
  });

  it("updates content in place, as a new revision of the same file", async () => {
    replies.push({ status: 200, body: { id: "f1", headRevisionId: "r2" } });
    await api().update("f1", "{}");
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].url).toContain("/upload/drive/v3/files/f1?uploadType=media");
  });

  it("trashes rather than deletes (H7), and renames by metadata (H3)", async () => {
    replies.push({ status: 200, body: { id: "f1" } }, { status: 200, body: { id: "f1" } });
    await api().trash("f1");
    await api().rename("f1", "new.estoria.json");
    expect(requests.map((r) => [r.method, r.body])).toEqual([
      ["PATCH", '{"trashed":true}'],
      ["PATCH", '{"name":"new.estoria.json"}'],
    ]);
    expect(requests.some((r) => r.method === "DELETE")).toBe(false);
  });
});

describe("failures", () => {
  it("refreshes the token once on a 401 and retries", async () => {
    replies.push({ status: 401 }, { status: 200, body: { id: "f1" } });
    await api().get("f1");
    expect(requests.map((r) => r.headers.authorization)).toEqual(["Bearer t1", "Bearer t2"]);
    expect(sleeps).toEqual([]);
  });

  it("backs off and retries on 429, 5xx and rate-limit 403s (H14)", async () => {
    replies.push(
      { status: 429 },
      { status: 503 },
      { status: 403, body: { error: { errors: [{ reason: "userRateLimitExceeded" }] } } },
      { status: 200, body: { id: "f1" } }
    );
    expect((await api().get("f1"))?.id).toBe("f1");
    expect(sleeps).toEqual([1000, 2000, 4000]);
  });

  it("gives up as offline, never as 'reconnect', when Google stays down", async () => {
    for (let i = 0; i < 5; i++) replies.push({ status: 503 });
    await expect(api().get("f1")).rejects.toBeInstanceOf(DriveOfflineError);
    expect(requests).toHaveLength(5);
  });

  it("treats a dropped connection as offline after retrying", async () => {
    for (let i = 0; i < 5; i++) replies.push("network-error");
    await expect(api().download("f1")).rejects.toBeInstanceOf(DriveOfflineError);
  });

  it("does not retry a refusal retrying won't fix", async () => {
    replies.push({ status: 403, body: { error: { errors: [{ reason: "insufficientPermissions" }] } } });
    const err = await api().get("f1").catch((e) => e);
    expect(err).toBeInstanceOf(DriveRequestError);
    expect(requests).toHaveLength(1);
  });

  it("never retries a create: one request, then the caller looks (H2c)", async () => {
    replies.push("network-error");
    await expect(api().create("folder1", "a.estoria.json", "{}")).rejects.toBeInstanceOf(DriveOfflineError);
    replies.push({ status: 503 });
    await expect(api().create("folder1", "a.estoria.json", "{}")).rejects.toBeInstanceOf(DriveOfflineError);
    expect(requests).toHaveLength(2);
    expect(sleeps).toEqual([]);
  });
});
