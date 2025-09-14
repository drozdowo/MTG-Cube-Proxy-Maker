// Simple in-memory cache; swap with IndexedDB/localforage later
const store = new Map<string, unknown>()

export const cache = {
  async get<T>(key: string): Promise<T | undefined> {
    return store.get(key) as T | undefined
  },
  async set<T>(key: string, value: T): Promise<void> {
    store.set(key, value)
  },
}
