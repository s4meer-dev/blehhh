/**
 * blehh - Adaptive Concurrency Limiter
 * Dynamically adjusts concurrency limits based on observed RTT latency feedback,
 * inspired by TCP Vegas congestion control and Netflix's concurrency-limits architecture.
 */

export class AdaptiveLimiterRejectedError extends Error {
  constructor(message = 'Adaptive concurrency limiter rejected execution: capacity saturated.') {
    super(message);
    this.name = 'AdaptiveLimiterRejectedError';
  }
}

export interface AdaptiveLimiterOptions {
  /** Initial concurrency limit (default: 10) */
  initialLimit?: number;
  /** Minimum concurrency limit floor (default: 2) */
  minLimit?: number;
  /** Maximum concurrency limit ceiling (default: 100) */
  maxLimit?: number;
  /** Multiplicative decrease factor applied when congestion is detected (default: 0.8) */
  backoffRatio?: number;
  /** Additive increase step applied when downstream latency is healthy (default: 1) */
  additiveStep?: number;
  /** Tolerance multiplier above baseline minRTT before flagging congestion (default: 1.5) */
  toleranceFactor?: number;
  /** Exponential moving average smoothing factor alpha between 0 and 1 (default: 0.2) */
  smoothingAlpha?: number;
}

export interface AdaptiveLimiterMetrics {
  currentLimit: number;
  activeExecutions: number;
  minRttMs: number;
  smoothedRttMs: number;
  totalExecutions: number;
  rejectedExecutions: number;
  congestionEvents: number;
}

/**
 * Self-tuning concurrency limiter that guards downstream services from overload
 * without requiring hardcoded static concurrency caps.
 */
export class AdaptiveConcurrencyLimiter {
  readonly name?: string;
  private currentLimit: number;
  private readonly minLimit: number;
  private readonly maxLimit: number;
  private readonly backoffRatio: number;
  private readonly additiveStep: number;
  private readonly toleranceFactor: number;
  private readonly smoothingAlpha: number;

  private activeExecutions = 0;
  private minRttMs = Infinity;
  private smoothedRttMs = 0;
  private totalExecutions = 0;
  private rejectedExecutions = 0;
  private congestionEvents = 0;

  constructor(options: AdaptiveLimiterOptions = {}, name?: string) {
    this.name = name;
    this.currentLimit = Math.max(1, options.initialLimit ?? 10);
    this.minLimit = Math.max(1, options.minLimit ?? 2);
    this.maxLimit = Math.max(this.minLimit, options.maxLimit ?? 100);
    this.backoffRatio = Math.min(0.99, Math.max(0.1, options.backoffRatio ?? 0.8));
    this.additiveStep = Math.max(1, options.additiveStep ?? 1);
    this.toleranceFactor = Math.max(1.05, options.toleranceFactor ?? 1.5);
    this.smoothingAlpha = Math.min(1, Math.max(0.01, options.smoothingAlpha ?? 0.2));
  }

  /**
   * Executes an asynchronous action if concurrency budget allows, updating latency telemetry.
   */
  public async execute<T>(action: () => Promise<T> | T): Promise<T> {
    if (this.activeExecutions >= this.currentLimit) {
      this.rejectedExecutions++;
      throw new AdaptiveLimiterRejectedError(
        `Adaptive concurrency limit reached (${this.currentLimit}). Rejected execution.`
      );
    }

    this.activeExecutions++;
    this.totalExecutions++;
    const startTime = Date.now();

    try {
      const result = await action();
      const rttMs = Math.max(1, Date.now() - startTime);
      this.recordLatency(rttMs);
      return result;
    } catch (error) {
      const rttMs = Math.max(1, Date.now() - startTime);
      this.recordLatency(rttMs);
      throw error;
    } finally {
      this.activeExecutions = Math.max(0, this.activeExecutions - 1);
    }
  }

  /**
   * Updates minimum and smoothed RTT estimates, adjusting concurrency dynamically.
   */
  private recordLatency(rttMs: number): void {
    if (rttMs < this.minRttMs) {
      this.minRttMs = rttMs;
    }

    if (this.smoothedRttMs === 0) {
      this.smoothedRttMs = rttMs;
    } else {
      this.smoothedRttMs =
        this.smoothingAlpha * rttMs + (1 - this.smoothingAlpha) * this.smoothedRttMs;
    }

    const threshold = this.minRttMs * this.toleranceFactor;

    if (this.smoothedRttMs > threshold) {
      // Congestion detected: Multiplicative decrease
      this.congestionEvents++;
      const nextLimit = Math.max(
        this.minLimit,
        Math.floor(this.currentLimit * this.backoffRatio)
      );
      this.currentLimit = nextLimit;
    } else {
      // Latency healthy: Additive increase
      const nextLimit = Math.min(
        this.maxLimit,
        this.currentLimit + this.additiveStep
      );
      this.currentLimit = nextLimit;
    }
  }

  /**
   * Returns current telemetry and concurrency tuning metrics.
   */
  public getMetrics(): AdaptiveLimiterMetrics {
    return {
      currentLimit: this.currentLimit,
      activeExecutions: this.activeExecutions,
      minRttMs: this.minRttMs === Infinity ? 0 : this.minRttMs,
      smoothedRttMs: Math.round(this.smoothedRttMs * 100) / 100,
      totalExecutions: this.totalExecutions,
      rejectedExecutions: this.rejectedExecutions,
      congestionEvents: this.congestionEvents,
    };
  }

  /**
   * Manually sets or resets the current concurrency limit.
   */
  public setLimit(limit: number): void {
    this.currentLimit = Math.max(this.minLimit, Math.min(this.maxLimit, limit));
  }
}
