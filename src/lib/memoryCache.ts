type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export class MemoryCache<T> {
  private readonly map = new Map<string, CacheEntry<T>>();

  constructor(private readonly options: { maxEntries: number; ttlMs: number }) {}

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }

    // Refresh insertion order for simple LRU behavior.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    const entry: CacheEntry<T> = { value, expiresAt: Date.now() + this.options.ttlMs };
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, entry);
    this.evictOverflow();
  }

  pruneExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.map.entries()) {
      if (now > entry.expiresAt) this.map.delete(key);
    }
  }

  private evictOverflow(): void {
    while (this.map.size > this.options.maxEntries) {
      const firstKey = this.map.keys().next().value as string | undefined;
      if (!firstKey) break;
      this.map.delete(firstKey);
    }
  }
}

