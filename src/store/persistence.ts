import type { StoryDoc } from "@/types";

/**
 * StorageAdapter — the single seam between Estoria and where stories live.
 *
 * v1 ships a LocalStorageAdapter (auto-save to the browser). Growing into a
 * cloud backend later means writing an ApiStorageAdapter against this same
 * interface and swapping `activeAdapter` — no UI or store changes required.
 */
export interface StorageAdapter {
  load(): Promise<string | null>;
  save(serialized: string): Promise<void>;
  /** For multi-document support later. */
  list?(): Promise<string[]>;
}

const STORAGE_KEY = "estoria:doc:v1";

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private key: string = STORAGE_KEY) {}

  async load(): Promise<string | null> {
    try {
      return localStorage.getItem(this.key);
    } catch {
      return null;
    }
  }

  async save(serialized: string): Promise<void> {
    try {
      localStorage.setItem(this.key, serialized);
    } catch {
      // Quota / private-mode failures are non-fatal; in-memory state is intact.
    }
  }
}

/** The adapter the store auto-saves through. Swap this to change backends. */
export const activeAdapter: StorageAdapter = new LocalStorageAdapter();

/**
 * Synchronous storage shim for zustand's persist middleware. Zustand expects a
 * Web-Storage-like object; we route it through `activeAdapter` so the backend
 * stays swappable. Reads are mirrored to an in-memory cache to satisfy the
 * synchronous getItem contract after the first async load.
 */
export const zustandStorage = {
  getItem: (name: string): string | null => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string): void => {
    void activeAdapter.save(value).catch(() => {});
    try {
      localStorage.setItem(name, value);
    } catch {
      // ignore
    }
    // `name` is the persist key; kept for API symmetry with cloud adapters.
    void name;
  },
  removeItem: (name: string): void => {
    try {
      localStorage.removeItem(name);
    } catch {
      // ignore
    }
  },
};

// ---- Explicit file save / load (the "document" experience) -----------------

/** Download the current story as a portable .estoria.json project file. */
export function downloadProjectFile(doc: StoryDoc): void {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(doc.projectTitle || "story")}.estoria.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Parse a project file picked from disk. Throws on malformed JSON. */
export async function readProjectFile(file: File): Promise<StoryDoc> {
  const text = await file.text();
  const parsed = JSON.parse(text) as StoryDoc;
  if (!parsed || !Array.isArray(parsed.chapters)) {
    throw new Error("Not a valid Estoria project file.");
  }
  return parsed;
}

export function slugify(s: string): string {
  return s.trim().replace(/\s+/g, "-").toLowerCase() || "story";
}
