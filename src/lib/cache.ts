// Placeholder cache; replace with IndexedDB later
export const cache = {
  async get<T>(_key: string): Promise<T | undefined> {
    return undefined
  },
  async set<T>(_key: string, _value: T): Promise<void> {
    // no-op
  },
}
