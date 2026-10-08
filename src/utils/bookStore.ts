import { BookConfig, normalizeBookConfig } from '../../shared/bookConfig';

// Uploaded books are kept in the browser (IndexedDB) so they survive reloads.
const DB_NAME = 'lectern';
const STORE = 'books';
const LAST_BOOK_KEY = 'lectern:lastBookId';

interface SavedBookRecord {
  id: string;
  savedAt: number;
  book: unknown;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Saved books, most recently saved first. Returns [] if storage is unavailable. */
export async function listSavedBooks(): Promise<BookConfig[]> {
  try {
    const records = await withStore<SavedBookRecord[]>('readonly', (store) => store.getAll());
    return records
      .sort((a, b) => b.savedAt - a.savedAt)
      .flatMap((record) => {
        try {
          // Re-normalize so books saved by an older version still load
          return [{ ...normalizeBookConfig(record.book), id: record.id }];
        } catch (err) {
          console.warn(`Skipping unreadable saved book ${record.id}:`, err);
          return [];
        }
      });
  } catch (err) {
    console.warn('Could not read saved books:', err);
    return [];
  }
}

/** Saves (or replaces) a book. Returns false if it could not be stored. */
export async function saveBook(book: BookConfig): Promise<boolean> {
  try {
    await withStore('readwrite', (store) => store.put({ id: book.id, savedAt: Date.now(), book }));
    return true;
  } catch (err) {
    console.warn('Could not save book:', err);
    return false;
  }
}

export async function deleteSavedBook(id: string): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(id));
  } catch (err) {
    console.warn('Could not delete saved book:', err);
  }
}

export function getLastBookId(): string | null {
  try {
    return localStorage.getItem(LAST_BOOK_KEY);
  } catch {
    return null;
  }
}

export function setLastBookId(id: string): void {
  try {
    localStorage.setItem(LAST_BOOK_KEY, id);
  } catch {
    // Storage may be blocked; remembering the last book is optional
  }
}
