// Minimal IndexedDB wrapper for the uploads store. IndexedDB holds Blobs
// directly (no base64 bloat) and its quota is browser-managed storage —
// hundreds of MB to GBs — so a real personal library of many images fits,
// unlike localStorage's ~5 MB cap.

const DB_NAME = 'tileswitch';
const DB_VERSION = 2;
const STORE = 'uploads';
// Small key-value store for single-value app data (e.g. the custom background
// image). Separate from `uploads` so library reads never see it.
const KV_STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        // keyPath 'id'; addedAt index lets us read in insertion order.
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('addedAt', 'addedAt');
      }
      if (!db.objectStoreNames.contains(KV_STORE)) {
        db.createObjectStore(KV_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

// Ask the browser to persist this origin's storage so the library (now stored
// at full quality) is far less likely to be evicted under disk pressure. Safe
// to call repeatedly; no-ops where unsupported. Fire-and-forget.
let persistenceRequested = false;
export function requestPersistence(): void {
  if (persistenceRequested) return;
  persistenceRequested = true;
  navigator.storage?.persist?.().catch(() => {
    /* best-effort */
  });
}

export interface StoredUpload {
  id: string;
  title: string;
  blob: Blob;
  type: string;
  addedAt: number;
  /**
   * User-defined position in the library (lower = earlier). Optional for
   * backward compatibility; rows without it fall back to `addedAt` order.
   */
  order?: number;
}

/**
 * All uploads in library order: by `order` when set, else by insertion time.
 * The library grid and rotation read this, so the persisted order sticks.
 */
export async function getAllUploads(): Promise<StoredUpload[]> {
  const db = await openDb();
  const rows = await new Promise<StoredUpload[]>((resolve, reject) => {
    const t = db.transaction(STORE, 'readonly');
    const index = t.objectStore(STORE).index('addedAt');
    const req = index.getAll();
    req.onsuccess = () => resolve(req.result as StoredUpload[]);
    req.onerror = () => reject(req.error);
  });
  // Stable sort: rows keep their addedAt order (getAll via the index) unless an
  // explicit `order` moves them.
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      const ao = a.row.order ?? a.row.addedAt;
      const bo = b.row.order ?? b.row.addedAt;
      return ao === bo ? a.i - b.i : ao - bo;
    })
    .map(({ row }) => row);
}

export function putUpload(entry: StoredUpload): Promise<IDBValidKey> {
  return tx('readwrite', (store) => store.put(entry));
}

export function deleteUpload(id: string): Promise<undefined> {
  return tx('readwrite', (store) => store.delete(id));
}

// --- Key-value store (single-value app data) -------------------------------

function kvTx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(KV_STORE, mode);
        const req = run(t.objectStore(KV_STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export function kvGet<T>(key: string): Promise<T | undefined> {
  return kvTx('readonly', (store) => store.get(key) as IDBRequest<T | undefined>);
}

export function kvSet(key: string, value: unknown): Promise<IDBValidKey> {
  return kvTx('readwrite', (store) => store.put(value, key));
}

export function kvDelete(key: string): Promise<undefined> {
  return kvTx('readwrite', (store) => store.delete(key));
}
