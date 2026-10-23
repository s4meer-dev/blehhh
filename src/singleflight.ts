/**
 * SingleFlight provides duplicate call suppression and request coalescing.
 *
 * When multiple concurrent callers invoke an asynchronous task with the same key,
 * SingleFlight ensures that only one underlying function executes, and all concurrent
 * callers receive the same result or error once it completes.
 *
 * This eliminates the cache stampede (dog-piling) problem and prevents downstream service
 * saturation during transient spikes.
 */

export interface SingleFlightResult<T> {
  /** The value resolved by the primary task */
  readonly val: T;
  /** Whether this call was shared with a concurrent in-flight execution */
  readonly shared: boolean;
}

export interface SingleFlightMetrics {
  /** Number of currently in-flight unique keys */
  readonly inFlightCount: number;
  /** Active keys currently executing */
  readonly activeKeys: string[];
  /** Total number of calls routed through this group */
  readonly totalCalls: number;
  /** Total number of calls that were shared with an existing in-flight execution */
  readonly sharedExecutions: number;
}

interface InFlightCall<T> {
  promise: Promise<T>;
  callers: number;
}

export class SingleFlightGroup<T = unknown> {
  private readonly calls = new Map<string, InFlightCall<T>>();
  private totalCallsCount = 0;
  private sharedCallsCount = 0;

  /**
   * Execute an asynchronous action with coalescing.
   * If a call with the specified key is already in flight, the caller awaits the existing execution.
   */
  async do(key: string, fn: () => Promise<T>): Promise<SingleFlightResult<T>> {
    this.totalCallsCount++;

    const existing = this.calls.get(key);
    if (existing) {
      existing.callers++;
      this.sharedCallsCount++;
      try {
        const val = await existing.promise;
        return { val, shared: true };
      } catch (err) {
        throw err;
      }
    }

    let resolvePromise!: (val: T) => void;
    let rejectPromise!: (err: unknown) => void;

    const promise = new Promise<T>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    const call: InFlightCall<T> = {
      promise,
      callers: 1,
    };

    this.calls.set(key, call);

    try {
      const result = await fn();
      resolvePromise(result);
      return { val: result, shared: false };
    } catch (err) {
      rejectPromise(err);
      throw err;
    } finally {
      this.calls.delete(key);
    }
  }

  /**
   * Convenience wrapper that returns the resolved value directly without the metadata wrapper.
   */
  async execute(key: string, fn: () => Promise<T>): Promise<T> {
    const { val } = await this.do(key, fn);
    return val;
  }

  /**
   * Forgets the in-flight key so that any subsequent call will trigger a fresh execution.
   * Any current callers already awaiting will still receive their resolution.
   */
  forget(key: string): boolean {
    return this.calls.delete(key);
  }

  /**
   * Retrieves operational metrics and in-flight diagnostics.
   */
  metrics(): SingleFlightMetrics {
    return {
      inFlightCount: this.calls.size,
      activeKeys: Array.from(this.calls.keys()),
      totalCalls: this.totalCallsCount,
      sharedExecutions: this.sharedCallsCount,
    };
  }

  /**
   * Clears internal metrics counters.
   */
  resetMetrics(): void {
    this.totalCallsCount = 0;
    this.sharedCallsCount = 0;
  }
}

/**
 * Factory helper to create a new SingleFlightGroup instance.
 */
export function createSingleFlight<T = unknown>(): SingleFlightGroup<T> {
  return new SingleFlightGroup<T>();
}
