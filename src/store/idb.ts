/**
 * The one IndexedDB database Estoria keeps at rest, and the helpers both of its
 * payload stores share.
 *
 * There are two payloads now — manuscripts (`store/prose.ts`) and images
 * (`store/images.ts`) — and they are the same idea twice: something too big to
 * sit in the ~5MB localStorage blob, lifted out before `JSON.stringify` sees it
 * and put back on load. What they must **not** be is two independent databases.
 * One open, one timeout, one availability answer: the load has to make a single
 * decision about whether the payloads behind this document are reachable, and
 * two databases would let it half-answer — reaching the prose, missing the
 * images, and saving a document that has quietly lost its covers.
 */

const DB_NAME = "estoria";
/**
 * v1 held `manuscripts` alone. v2 adds `images`. The upgrade is additive and
 * guarded, so a browser carrying a v1 database gains the store and keeps every
 * manuscript in it.
 */
const DB_VERSION = 2;

export const STORE_PROSE = "manuscripts";
export const STORE_IMAGES = "images";

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * How long to wait for `indexedDB.open` before giving up on it.
 *
 * It is not enough to handle `onerror` and `onblocked`: an open can simply
 * never settle — a database left locked by an unclean shutdown, or a second
 * window (an installed app and a browser tab are two) holding it. Without a
 * bound, the load that awaits this never returns, hydration never finishes, and
 * the app sits forever on a first-launch screen over an intact document. That
 * is the failure this timeout exists to convert into an honest error.
 */
const OPEN_TIMEOUT_MS = 5000;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("IndexedDB timed out"));
    }, OPEN_TIMEOUT_MS);
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROSE)) db.createObjectStore(STORE_PROSE);
      if (!db.objectStoreNames.contains(STORE_IMAGES)) db.createObjectStore(STORE_IMAGES);
    };
    req.onsuccess = () => finish(() => resolve(req.result));
    req.onerror = () => finish(() => reject(req.error));
    req.onblocked = () => finish(() => reject(new Error("IndexedDB blocked")));
  });
  return dbPromise;
}

/**
 * Is IndexedDB usable here? Some private-browsing modes expose the API and then
 * fail to open, so this is a real open rather than a feature check.
 *
 * **When it is not, both payloads simply stay in the localStorage blob**,
 * exactly as they did before either split existed. Slower and quota-bound, but
 * never lost — a writer on a browser we cannot use IndexedDB in still keeps
 * their words and their pictures.
 *
 * That is the whole answer only for a document whose payloads were *never*
 * moved out. For one already written externally, "unavailable" does not mean
 * "there is none" — it means we cannot see it, and handing the store a doc of
 * blank chapters and missing covers would be one auto-save away from making
 * that permanent. The stored blob records which case it is (`payloadsExternal`)
 * and `persistence.getItem` refuses to load rather than guess.
 */
export async function payloadStoreAvailable(): Promise<boolean> {
  if (typeof indexedDB === "undefined") return false;
  try {
    await openDb();
    return true;
  } catch {
    dbPromise = null;
    return false;
  }
}

/** Both payloads key by a JSON array whose first element is the project id. */
function projectOf(key: string): string {
  try {
    return (JSON.parse(key) as string[])[0] ?? "";
  } catch {
    return "";
  }
}

/**
 * Keys to delete: a payload we hold for a project that is still here, but for a
 * chapter, asset or book that no longer is. A payload belonging to a project
 * **absent from this snapshot is deliberately left alone** — an incomplete
 * snapshot is a bug we would rather leak a few kilobytes over than answer by
 * deleting someone's writing.
 */
export function staleKeys(live: Map<string, string>, known: Set<string>, projectIds: Set<string>): string[] {
  const out: string[] = [];
  for (const k of known) {
    if (!live.has(k) && projectIds.has(projectOf(k))) out.push(k);
  }
  return out;
}

/** Everything one store holds on this origin, keyed as that store keys it. */
export async function loadAllFrom(store: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return resolve();
      if (typeof cur.value === "string") out.set(String(cur.key), cur.value);
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
  return out;
}

/** Apply one batch of writes and deletes to one store, in a single transaction. */
export async function writeTo(
  store: string,
  puts: Map<string, string>,
  deletes: Iterable<string>
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    for (const [k, v] of puts) os.put(v, k);
    for (const k of deletes) os.delete(k);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
