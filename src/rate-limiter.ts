/**
 * blehh - Rate Limiter Implementations
 * Features Token Bucket, Sliding Window Log, and Leaky Bucket algorithms.
 */

export interface TokenBucketOptions {
  /** Maximum capacity of the token bucket */
  capacity: number;
  /** Number of tokens refilled per interval */
  refillRate: number;
  /** Refill interval in milliseconds (default: 1000) */
  refillIntervalMs?: number;
}

export class TokenBucketRateLimiter {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillRate: number;
  private readonly refillIntervalMs: number;
  private lastRefillTimestamp: number;

  constructor(options: TokenBucketOptions) {
    this.capacity = options.capacity;
    this.refillRate = options.refillRate;
    this.refillIntervalMs = options.refillIntervalMs ?? 1000;
    this.tokens = options.capacity;
    this.lastRefillTimestamp = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillTimestamp;
    const tokensToAdd = (elapsed / this.refillIntervalMs) * this.refillRate;

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
      this.lastRefillTimestamp = now;
    }
  }

  public tryConsume(tokens = 1): boolean {
    this.refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }

  public getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}

export interface SlidingWindowOptions {
  /** Maximum number of requests allowed in the time window */
  maxRequests: number;
  /** Window size in milliseconds (e.g. 60000 for 1 minute) */
  windowMs: number;
}

export class SlidingWindowRateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly timestamps: number[] = [];

  constructor(options: SlidingWindowOptions) {
    this.maxRequests = options.maxRequests;
    this.windowMs = options.windowMs;
  }

  public tryConsume(): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Prune expired entries
    while (this.timestamps.length > 0 && this.timestamps[0]! <= windowStart) {
      this.timestamps.shift();
    }

    if (this.timestamps.length < this.maxRequests) {
      this.timestamps.push(now);
      return true;
    }

    return false;
  }

  public getRemainingQuota(): number {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    while (this.timestamps.length > 0 && this.timestamps[0]! <= windowStart) {
      this.timestamps.shift();
    }

    return Math.max(0, this.maxRequests - this.timestamps.length);
  }
}

export interface LeakyBucketOptions {
  /** Maximum capacity of the leaky bucket */
  capacity: number;
  /** Leak rate (number of items processed per interval) */
  leakRate: number;
  /** Leak interval in milliseconds (default: 1000) */
  leakIntervalMs?: number;
}

/**
 * Leaky bucket rate limiter for smoothing bursts into constant-rate flow.
 */
export class LeakyBucketRateLimiter {
  private level: number = 0;
  private readonly capacity: number;
  private readonly leakRate: number;
  private readonly leakIntervalMs: number;
  private lastLeakTimestamp: number;

  constructor(options: LeakyBucketOptions) {
    this.capacity = options.capacity;
    this.leakRate = options.leakRate;
    this.leakIntervalMs = options.leakIntervalMs ?? 1000;
    this.lastLeakTimestamp = Date.now();
  }

  private leak(): void {
    const now = Date.now();
    const elapsed = now - this.lastLeakTimestamp;
    const leaked = (elapsed / this.leakIntervalMs) * this.leakRate;
    if (leaked > 0) {
      this.level = Math.max(0, this.level - leaked);
      this.lastLeakTimestamp = now;
    }
  }

  public tryAdd(amount = 1): boolean {
    this.leak();
    if (this.level + amount <= this.capacity) {
      this.level += amount;
      return true;
    }
    return false;
  }

  public getCurrentWaterLevel(): number {
    this.leak();
    return Math.round(this.level * 100) / 100;
  }
}
