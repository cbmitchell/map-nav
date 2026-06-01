const DB_NAME = 'office-navigator-db';
const DB_VERSION = 1;
const STORE_NAME = 'section-images';

let dbPromise: Promise<IDBDatabase> | null = null;

function openImageDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function saveImage(sectionId: string, imageData: string): Promise<void> {
  const db = await openImageDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put({ id: sectionId, imageData });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getAllImages(): Promise<Map<string, string>> {
  const db = await openImageDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      const records = req.result as { id: string; imageData: string }[];
      resolve(new Map(records.map((r) => [r.id, r.imageData])));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteImage(sectionId: string): Promise<void> {
  const db = await openImageDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(sectionId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
