type CacheEntry = {
  value: unknown;
  expiresAt: number;
};

export class SharedLinkCache {
  private store = new Map<string, CacheEntry>();
  private tokenIndex = new Map<string, Set<string>>();
  private maxEntries: number;

  constructor(maxEntries = 1000) {
    this.maxEntries = maxEntries;
  }

  get(key: string): unknown | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.delete(key);
      return null;
    }
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: unknown, ttlMs: number, token?: string): void {
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) this.delete(firstKey);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    if (token) {
      let keys = this.tokenIndex.get(token);
      if (!keys) {
        keys = new Set();
        this.tokenIndex.set(token, keys);
      }
      keys.add(key);
    }
  }

  delete(key: string): void {
    const entry = this.store.get(key);
    if (!entry) return;
    this.store.delete(key);
    for (const [token, keys] of this.tokenIndex) {
      if (keys.has(key)) {
        keys.delete(key);
        if (keys.size === 0) this.tokenIndex.delete(token);
      }
    }
  }

  invalidateByToken(token: string): number {
    const keys = this.tokenIndex.get(token);
    if (!keys) return 0;
    let count = 0;
    for (const key of [...keys]) {
      this.store.delete(key);
      count += 1;
    }
    this.tokenIndex.delete(token);
    return count;
  }

  clear(): void {
    this.store.clear();
    this.tokenIndex.clear();
  }

  size(): number {
    return this.store.size;
  }
}

export const sharedLinkCache = new SharedLinkCache();

export const DEFAULT_SHARED_LINK_TTL_MS = 60_000;
