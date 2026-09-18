export type EvictionPolicy = 'lru' | 'fifo';

export interface CacheOptions {
  maxSize?: number;
  defaultTtlMs?: number;
  evictionPolicy?: EvictionPolicy;
}

interface CacheEntry<V> {
  value: V;
  expiresAt: number | null;
  lastAccessed: number;
}

export class MemoryCache<K = string, V = unknown> {
  private readonly items = new Map<K, CacheEntry<V>>();
  private readonly maxSize: number;
  private readonly defaultTtlMs: number;
  private readonly evictionPolicy: EvictionPolicy;

  constructor(options: CacheOptions = {}) {
    this.maxSize = options.maxSize ?? 1000;
    this.defaultTtlMs = options.defaultTtlMs ?? 0; // 0 = indefinite
    this.evictionPolicy = options.evictionPolicy ?? 'lru';
  }

  get(key: K): V | undefined {
    const entry = this.items.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.items.delete(key);
      return undefined;
    }

    entry.lastAccessed = Date.now();
    if (this.evictionPolicy === 'lru') {
      // Re-insert to refresh Map insertion order for LRU
      this.items.delete(key);
      this.items.set(key, entry);
    }

    return entry.value;
  }

  set(key: K, value: V, ttlMs?: number): this {
    const effectiveTtl = ttlMs ?? this.defaultTtlMs;
    const expiresAt = effectiveTtl > 0 ? Date.now() + effectiveTtl : null;

    if (this.items.has(key)) {
      this.items.delete(key);
    } else if (this.items.size >= this.maxSize) {
      this.evictOne();
    }

    this.items.set(key, {
      value,
      expiresAt,
      lastAccessed: Date.now(),
    });

    return this;
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: K): boolean {
    return this.items.delete(key);
  }

  clear(): void {
    this.items.clear();
  }

  size(): number {
    this.pruneExpired();
    return this.items.size;
  }

  pruneExpired(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [key, entry] of this.items.entries()) {
      if (entry.expiresAt !== null && now > entry.expiresAt) {
        this.items.delete(key);
        pruned++;
      }
    }
    return pruned;
  }

  private evictOne(): void {
    if (this.items.size === 0) return;

    if (this.evictionPolicy === 'fifo' || this.evictionPolicy === 'lru') {
      // The first entry in Map iterator is the oldest inserted (FIFO) or oldest accessed (LRU)
      const oldestKey = this.items.keys().next().value;
      if (oldestKey !== undefined) {
        this.items.delete(oldestKey);
      }
    }
  }
}
