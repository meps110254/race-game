// Safe LocalStorage Wrapper with in-memory fallback to handle security exceptions in iframe sandboxes
const memoryStorage: Record<string, string> = {};

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn("localStorage.getItem is not accessible, using memory fallback:", e);
      return memoryStorage[key] !== undefined ? memoryStorage[key] : null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn("localStorage.setItem is not accessible, using memory fallback:", e);
      memoryStorage[key] = value;
    }
  },
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn("localStorage.removeItem is not accessible, using memory fallback:", e);
      delete memoryStorage[key];
    }
  },
  clear(): void {
    try {
      localStorage.clear();
    } catch (e) {
      console.warn("localStorage.clear is not accessible:", e);
    }
    for (const key in memoryStorage) {
      delete memoryStorage[key];
    }
  }
};
