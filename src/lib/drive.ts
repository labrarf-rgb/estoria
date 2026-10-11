import { driveAuth } from "@/lib/driveAuth";
import { DriveOfflineError, DriveRequestError } from "@/lib/driveErrors";

/**
 * Google Drive v3 over plain fetch: the handful of calls a `DriveFolder`
 * needs, nothing more. The browser talks to Google directly, so a manuscript
 * never passes through Estoria's broker.
 *
 * Rules from docs/PLAN-drive-sync.md:
 * - H14: 429, 5xx and Drive's rate-limit 403s back off and retry (1s, 2s, 4s…),
 *   and a dropped connection is "offline", never "needs reconnecting".
 * - A 401 refreshes the access token once and retries.
 * - H2(c): creating a file is never retried blindly (a retry could make a
 *   second copy); the caller lists by name after a failed create instead.
 * - H13: anything over 4 MB goes up as a resumable upload (the simple one stops at 5 MB).
 */

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
export const FOLDER_MIME = "application/vnd.google-apps.folder";
const JSON_MIME = "application/json";
/** Above this many bytes, upload resumably (H13). */
export const RESUMABLE_OVER = 4 * 1024 * 1024;
const FILE_FIELDS = "id,name,mimeType,headRevisionId,modifiedTime,trashed,parents";
/** Attempts before giving up on a retryable failure: waits of 1+2+4+8 s. */
const MAX_ATTEMPTS = 5;
const RATE_LIMIT_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded"]);

export interface DriveFile {
  id: string;
  name: string;
  mimeType?: string;
  /** Changes with every content write: the H4 "did it move?" check. */
  headRevisionId?: string;
  modifiedTime?: string;
  trashed?: boolean;
  parents?: string[];
}

export interface DriveDeps {
  fetch: typeof fetch;
  getToken: () => Promise<string>;
  invalidateToken: () => void;
  sleep: (ms: number) => Promise<void>;
}

/** Drive's query language quotes with single quotes. */
const quote = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

const backoff = (attempt: number) => Math.min(1000 * 2 ** attempt, 5 * 60 * 1000);

export function createDrive(deps: DriveDeps) {
  async function request(url: string, init: RequestInit, opts: { retry?: boolean } = {}): Promise<Response> {
    const retry = opts.retry ?? true;
    let refreshedToken = false;
    for (let attempt = 0; ; attempt++) {
      const token = await deps.getToken();
      let res: Response;
      try {
        res = await deps.fetch(url, {
          ...init,
          headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${token}` },
        });
      } catch {
        if (retry && attempt < MAX_ATTEMPTS - 1) {
          await deps.sleep(backoff(attempt));
          continue;
        }
        throw new DriveOfflineError();
      }
      if (res.ok) return res;

      if (res.status === 401 && !refreshedToken) {
        deps.invalidateToken();
        refreshedToken = true;
        attempt--; // a token refresh isn't a failed attempt
        continue;
      }
      const body = (await res.json().catch(() => ({}))) as {
        error?: { errors?: Array<{ reason?: string }> };
      };
      const reason = body.error?.errors?.[0]?.reason;
      const transient =
        res.status === 429 || res.status >= 500 || (res.status === 403 && !!reason && RATE_LIMIT_REASONS.has(reason));
      if (transient && retry && attempt < MAX_ATTEMPTS - 1) {
        await deps.sleep(backoff(attempt));
        continue;
      }
      if (transient) throw new DriveOfflineError();
      throw new DriveRequestError(res.status, reason);
    }
  }

  const json = async <T>(res: Response) => (await res.json()) as T;

  /** Upload content to a resumable session (a new file, or a new revision of one). */
  async function resumable(
    method: "POST" | "PATCH",
    url: string,
    metadata: object,
    text: string,
    opts: { retry?: boolean }
  ): Promise<DriveFile> {
    const start = await request(
      url,
      {
        method,
        headers: { "content-type": "application/json; charset=UTF-8", "x-upload-content-type": JSON_MIME },
        body: JSON.stringify(metadata),
      },
      opts
    );
    const session = start.headers.get("location");
    if (!session) throw new DriveRequestError(start.status, "no upload session");
    return json<DriveFile>(
      await request(session, { method: "PUT", headers: { "content-type": JSON_MIME }, body: text }, opts)
    );
  }

  const bytes = (text: string) => new TextEncoder().encode(text).length;

  return {
    /** Files directly in `parent`, not trashed; optionally only those named `name`. */
    async list(opts: { parent: string; name?: string; folders?: boolean }): Promise<DriveFile[]> {
      const q = [`${quote(opts.parent)} in parents`, "trashed = false"];
      if (opts.name !== undefined) q.push(`name = ${quote(opts.name)}`);
      if (opts.folders) q.push(`mimeType = ${quote(FOLDER_MIME)}`);
      const out: DriveFile[] = [];
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({
          q: q.join(" and "),
          fields: `nextPageToken,files(${FILE_FIELDS})`,
          pageSize: "1000",
          spaces: "drive",
        });
        if (pageToken) params.set("pageToken", pageToken);
        const page = await json<{ files?: DriveFile[]; nextPageToken?: string }>(
          await request(`${API}/files?${params}`, { method: "GET" })
        );
        out.push(...(page.files ?? []));
        pageToken = page.nextPageToken;
      } while (pageToken);
      return out;
    },

    /** Folders Estoria can see by this name, anywhere (with drive.file: ones it made or was given). */
    async findFolders(name: string): Promise<DriveFile[]> {
      const params = new URLSearchParams({
        q: `name = ${quote(name)} and mimeType = ${quote(FOLDER_MIME)} and trashed = false`,
        fields: `files(${FILE_FIELDS})`,
        spaces: "drive",
      });
      return (await json<{ files?: DriveFile[] }>(await request(`${API}/files?${params}`, { method: "GET" }))).files ?? [];
    },

    /** Metadata, or null if the file is gone or no longer visible to Estoria. */
    async get(id: string): Promise<DriveFile | null> {
      try {
        return await json<DriveFile>(
          await request(`${API}/files/${encodeURIComponent(id)}?fields=${FILE_FIELDS}`, { method: "GET" })
        );
      } catch (e) {
        if (e instanceof DriveRequestError && e.status === 404) return null;
        throw e;
      }
    },

    async download(id: string): Promise<string> {
      return (await request(`${API}/files/${encodeURIComponent(id)}?alt=media`, { method: "GET" })).text();
    },

    async createFolder(name: string, parent?: string): Promise<DriveFile> {
      return json<DriveFile>(
        await request(
          `${API}/files?fields=${FILE_FIELDS}`,
          {
            method: "POST",
            headers: { "content-type": "application/json; charset=UTF-8" },
            body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parent ? { parents: [parent] } : {}) }),
          },
          { retry: false }
        )
      );
    },

    /** Create a file. Never retried: after a failure the caller looks before trying again (H2c). */
    async create(parent: string, name: string, text: string): Promise<DriveFile> {
      const metadata = { name, parents: [parent], mimeType: JSON_MIME };
      if (bytes(text) > RESUMABLE_OVER) {
        return resumable("POST", `${UPLOAD}/files?uploadType=resumable&fields=${FILE_FIELDS}`, metadata, text, {
          retry: false,
        });
      }
      const boundary = `estoria-${crypto.randomUUID()}`;
      const body =
        `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\ncontent-type: ${JSON_MIME}\r\n\r\n${text}\r\n--${boundary}--`;
      return json<DriveFile>(
        await request(
          `${UPLOAD}/files?uploadType=multipart&fields=${FILE_FIELDS}`,
          { method: "POST", headers: { "content-type": `multipart/related; boundary=${boundary}` }, body },
          { retry: false }
        )
      );
    },

    /** Replace a file's content (a new revision, same file ID). Safe to retry. */
    async update(id: string, text: string): Promise<DriveFile> {
      const path = `${UPLOAD}/files/${encodeURIComponent(id)}`;
      if (bytes(text) > RESUMABLE_OVER) {
        return resumable("PATCH", `${path}?uploadType=resumable&fields=${FILE_FIELDS}`, {}, text, {});
      }
      return json<DriveFile>(
        await request(`${path}?uploadType=media&fields=${FILE_FIELDS}`, {
          method: "PATCH",
          headers: { "content-type": JSON_MIME },
          body: text,
        })
      );
    },

    /** Rename in place: the file ID, and so the phone's link to it, stays (H3). */
    async rename(id: string, name: string): Promise<DriveFile> {
      return json<DriveFile>(
        await request(`${API}/files/${encodeURIComponent(id)}?fields=${FILE_FIELDS}`, {
          method: "PATCH",
          headers: { "content-type": "application/json; charset=UTF-8" },
          body: JSON.stringify({ name }),
        })
      );
    },

    /** Move to Drive's trash (recoverable for 30 days). Estoria never deletes outright (H7). */
    async trash(id: string): Promise<void> {
      await request(`${API}/files/${encodeURIComponent(id)}?fields=id`, {
        method: "PATCH",
        headers: { "content-type": "application/json; charset=UTF-8" },
        body: JSON.stringify({ trashed: true }),
      });
    },
  };
}

export type DriveApi = ReturnType<typeof createDrive>;

/** This page's Drive client, signed in through `driveAuth`. */
export const drive: DriveApi = createDrive({
  fetch: (...args) => fetch(...args),
  getToken: () => driveAuth.getAccessToken(),
  invalidateToken: () => driveAuth.invalidateAccessToken(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
});
