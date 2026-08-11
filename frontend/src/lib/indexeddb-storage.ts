/**
 * IndexedDB 存储适配器，实现 StateStorage 接口（getItem/setItem/removeItem 处理字符串），
 * 配合 createJSONStorage() 使用，替代 localStorage。
 *
 * 浏览器 IndexedDB 容量通常为磁盘剩余空间的 50%～无上限，远超 localStorage 的 5MB。
 */

const DB_NAME = "spiritlens-store";
const STORE_NAME = "persist";
const DB_VERSION = 1;

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => {
      _db = req.result;
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}

export const indexedDBStorage = {
  async getItem(name: string): Promise<string | null> {
    const db = await openDB();
    // 先查 IndexedDB
    const fromDB = await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(name);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    if (fromDB) return fromDB;

    // IndexedDB 没有时检查 localStorage（迁移旧数据）
    try {
      const fromLS = localStorage.getItem(name);
      if (fromLS) {
        // 立即迁到 IndexedDB
        await this.setItem(name, fromLS);
        localStorage.removeItem(name);
        console.info("[indexedDB] 已从 localStorage 迁移数据到 IndexedDB:", name);
        return fromLS;
      }
    } catch { /* localStorage 可能不可用 */ }

    return null;
  },

  async setItem(name: string, value: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(value, name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async removeItem(name: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};
