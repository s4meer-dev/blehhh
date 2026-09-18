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
      const oldestKey = this.items.keys().next().value;
      if (oldestKey !== undefined) {
        this.items.delete(oldestKey);
      }
    }
  }
}

export interface WithCacheOptions<K, V> {
  cache: MemoryCache<K, V>;
  key: K;
  ttlMs?: number;
  forceRefresh?: boolean;
}

/**
 * Cache-aside wrapper that returns cached item if present, otherwise executes fn and stores result.
 */
export async function withCache<K, V>(
  fn: () => Promise<V>,
  options: WithCacheOptions<K, V>
): Promise<V> {
  if (!options.forceRefresh) {
    const cached = options.cache.get(options.key);
    if (cached !== undefined) {
      return cached;
    }
  }

  const result = await fn();
  options.cache.set(options.key, result, options.ttlMs);
  return result;
}
