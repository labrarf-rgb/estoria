import type { DriveApi, DriveFile } from "@/lib/drive";
import { FOLDER_MIME } from "@/lib/drive";
import { DriveOfflineError } from "@/lib/driveErrors";

/**
 * An in-memory Google Drive with the behaviors DriveFolder's rules exist for:
 * revisions that move on every write, a trash, names that aren't unique, and
 * creates that can fail after landing. Tests only.
 */

interface StoredFile extends DriveFile {
  content: string;
  createdOrder: number;
}

export class FakeDrive {
  files = new Map<string, StoredFile>();
  /** Every call, in order, e.g. "update:f3". */
  calls: string[] = [];
  private nextId = 1;
  private nextRev = 1;
  private clock = Date.UTC(2026, 9, 11, 9, 0, 0);
  /** One-shot failure for the next create: "landed" = it reached Drive but the reply was lost. */
  failNextCreate: "landed" | "lost" | null = null;
  /** Runs inside `get`, before it answers: lets a test have "another device" write mid-sync. */
  beforeGet: ((id: string) => void) | null = null;

  private tick(): string {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  private meta(f: StoredFile): DriveFile {
    const { content: _c, createdOrder: _o, ...m } = f;
    return { ...m };
  }

  /** Put a file in Drive the way another device or the Drive website would. */
  put(parent: string, name: string, content: string, mimeType = "application/json"): string {
    const id = `f${this.nextId++}`;
    this.files.set(id, {
      id,
      name,
      parents: [parent],
      mimeType,
      trashed: false,
      content,
      headRevisionId: `r${this.nextRev++}`,
      modifiedTime: this.tick(),
      createdOrder: this.nextId,
    });
    return id;
  }

  /** Another device writes new content to an existing file (a new revision). */
  writeExternally(id: string, content: string): void {
    const f = this.files.get(id)!;
    f.content = content;
    f.headRevisionId = `r${this.nextRev++}`;
    f.modifiedTime = this.tick();
  }

  folder(name = "Estoria"): string {
    return this.put("root", name, "", FOLDER_MIME);
  }

  live(parent: string): StoredFile[] {
    return [...this.files.values()].filter((f) => !f.trashed && f.parents?.includes(parent));
  }

  named(parent: string, name: string): StoredFile[] {
    return this.live(parent).filter((f) => f.name === name);
  }

  api(): DriveApi {
    const files = this.files;
    const self = this;
    return {
      async list({ parent, name, folders }) {
        self.calls.push(`list:${name ?? "*"}`);
        return self
          .live(parent)
          .filter((f) => (name === undefined || f.name === name) && (!folders || f.mimeType === FOLDER_MIME))
          .map((f) => self.meta(f));
      },
      async findFolders(name) {
        return [...files.values()]
          .filter((f) => !f.trashed && f.mimeType === FOLDER_MIME && f.name === name)
          .map((f) => self.meta(f));
      },
      async get(id) {
        self.calls.push(`get:${id}`);
        self.beforeGet?.(id);
        const f = files.get(id);
        return f ? self.meta(f) : null;
      },
      async download(id) {
        self.calls.push(`download:${id}`);
        const f = files.get(id);
        if (!f) throw new Error(`no file ${id}`);
        return f.content;
      },
      async createFolder(name, parent) {
        const id = self.put(parent ?? "root", name, "", FOLDER_MIME);
        return self.meta(files.get(id)!);
      },
      async create(parent, name, text) {
        self.calls.push(`create:${name}`);
        const fail = self.failNextCreate;
        self.failNextCreate = null;
        if (fail === "lost") throw new DriveOfflineError();
        const id = self.put(parent, name, text);
        if (fail === "landed") throw new DriveOfflineError();
        return self.meta(files.get(id)!);
      },
      async update(id, text) {
        self.calls.push(`update:${id}`);
        self.writeExternally(id, text);
        return self.meta(files.get(id)!);
      },
      async rename(id, name) {
        self.calls.push(`rename:${id}:${name}`);
        const f = files.get(id)!;
        f.name = name;
        return self.meta(f);
      },
      async trash(id) {
        self.calls.push(`trash:${id}`);
        files.get(id)!.trashed = true;
      },
    };
  }
}
