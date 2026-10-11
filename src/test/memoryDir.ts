import type { BackupDirHandle } from "@/lib/backup";

/**
 * An in-memory stand-in for the user's Estoria folder: just enough of the
 * File System Access directory handle for lib/sync.ts and lib/backup.ts.
 * Tests only. It mirrors the real API's failure shapes (NotFoundError on a
 * missing file or a vanished folder) because sync's safety rules key off them.
 */
export interface MemoryFile {
  text: string;
  lastModified: number;
}

export class MemoryDir {
  readonly name = "Estoria";
  readonly kind = "directory" as const;
  files = new Map<string, MemoryFile>();
  /** Every read and write in order, e.g. "read:a.estoria.json". */
  log: string[] = [];
  /** Simulate the folder being moved or deleted out from under the app. */
  gone = false;
  /** Yield to the event loop inside reads, so unserialized callers would interleave. */
  slowReads = false;

  private notFound(): DOMException {
    return new DOMException("A requested file or directory could not be found.", "NotFoundError");
  }

  put(name: string, text: string, lastModified = Date.now()): void {
    this.files.set(name, { text, lastModified });
  }

  text(name: string): string | undefined {
    return this.files.get(name)?.text;
  }

  json(name: string): unknown {
    const t = this.text(name);
    return t === undefined ? undefined : JSON.parse(t);
  }

  names(): string[] {
    return [...this.files.keys()].sort();
  }

  private fileHandle(name: string) {
    return {
      kind: "file" as const,
      name,
      getFile: async () => {
        if (this.gone) throw this.notFound();
        const f = this.files.get(name);
        if (!f) throw this.notFound();
        if (this.slowReads) await new Promise((r) => setTimeout(r, 5));
        this.log.push(`read:${name}`);
        return { lastModified: f.lastModified, text: async () => f.text };
      },
      createWritable: async () => {
        if (this.gone) throw this.notFound();
        let buf = "";
        return {
          write: async (s: string) => {
            buf += s;
          },
          close: async () => {
            if (this.gone) throw this.notFound();
            this.files.set(name, { text: buf, lastModified: Date.now() });
            this.log.push(`write:${name}`);
          },
        };
      },
    };
  }

  async getFileHandle(name: string, opts?: { create?: boolean }) {
    if (this.gone) throw this.notFound();
    if (!this.files.has(name)) {
      if (!opts?.create) throw this.notFound();
      this.files.set(name, { text: "", lastModified: Date.now() });
    }
    return this.fileHandle(name);
  }

  async *values() {
    if (this.gone) throw this.notFound();
    for (const name of [...this.files.keys()]) yield this.fileHandle(name);
  }

  async removeEntry(name: string): Promise<void> {
    if (this.gone || !this.files.delete(name)) throw this.notFound();
    this.log.push(`remove:${name}`);
  }

  async queryPermission(): Promise<PermissionState> {
    return "granted";
  }

  async requestPermission(): Promise<PermissionState> {
    return "granted";
  }

  asHandle(): BackupDirHandle {
    return this as unknown as BackupDirHandle;
  }
}

/** A Map-backed localStorage, so the "last agreed" fingerprints have somewhere to live. */
export function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}
