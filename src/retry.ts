/**
 * blehh - Exponential Backoff & Retry Engine
 */

export type JitterStrategy = 'none' | 'full' | 'equal' | 'decorrelated';

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in milliseconds (default: 200) */
  baseDelayMs?: number;
  /** Maximum delay cap in milliseconds (default: 10000) */
  maxDelayMs?: number;
  /** Exponential backoff factor (default: 2) */
  factor?: number;
  /** Jitter strategy to prevent thundering herds (default: 'full') */
  jitter?: JitterStrategy;
  /** Optional filter predicate: return true to retry, false to abort immediately */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Callback invoked before each retry delay */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  /** AbortSignal for cooperative cancellation */
  signal?: AbortSignal;
}

export class RetryExhaustedError extends Error {
  readonly attempts: number;
  readonly lastError: unknown;

  constructor(attempts: number, lastError: unknown) {
    super(`Retry attempts exhausted after ${attempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
    this.name = 'RetryExhaustedError';
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

/**
 * Calculates backoff delay based on exponential factor and selected jitter.
 */
export function calculateBackoff(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  factor: number,
  jitter: JitterStrategy,
  previousDelayMs = 0
): number {
  const calculated = Math.min(maxDelayMs, baseDelayMs * Math.pow(factor, attempt - 1));

  switch (jitter) {
    case 'none':
      return calculated;
    case 'full':
      return Math.floor(Math.random() * calculated);
    case 'equal': {
      const half = calculated / 2;
      return Math.floor(half + Math.random() * half);
    }
    case 'decorrelated': {
      const sleep = Math.min(maxDelayMs, Math.max(baseDelayMs, previousDelayMs * 3));
      return Math.floor(baseDelayMs + Math.random() * (sleep - baseDelayMs + 1));
    }
    default:
      return calculated;
  }
}

export interface RetryPolicy {
  execute<T>(fn: (attempt: number) => Promise<T>): Promise<T>;
  calculateDelay(attempt: number, previousDelay?: number): number;
}

/**
 * Creates a reusable retry policy instance with pre-configured backoff options.
 */
export function createRetryPolicy(options: RetryOptions = {}): RetryPolicy {
  return {
    execute: (fn) => retry(fn, options),
    calculateDelay: (attempt, prev = 0) =>
      calculateBackoff(
        attempt,
        options.baseDelayMs ?? 200,
        options.maxDelayMs ?? 10000,
        options.factor ?? 2,
        options.jitter ?? 'full',
        prev
      ),
  };
}

/**
 * Executes an asynchronous function with exponential backoff and jitter.
 */
export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 200,
    maxDelayMs = 10000,
    factor = 2,
    jitter = 'full',
    shouldRetry = () => true,
    onRetry,
    signal,
  } = options;

  let attempt = 0;
  let previousDelay = 0;

  while (true) {
    attempt++;

    if (signal?.aborted) {
      throw signal.reason ?? new Error('Operation aborted');
    }

    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt > maxRetries || !shouldRetry(error, attempt)) {
        throw new RetryExhaustedError(attempt, error);
      }

      const delay = calculateBackoff(attempt, baseDelayMs, maxDelayMs, factor, jitter, previousDelay);
      previousDelay = delay;

      if (onRetry) {
        onRetry(error, attempt, delay);
      }

      await new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
          return reject(signal.reason ?? new Error('Operation aborted'));
        }

        const timer = setTimeout(() => {
          cleanup();
          resolve();
        }, delay);

        const onAbort = () => {
          clearTimeout(timer);
          cleanup();
          reject(signal?.reason ?? new Error('Operation aborted'));
        };

        const cleanup = () => {
          signal?.removeEventListener('abort', onAbort);
        };

        signal?.addEventListener('abort', onAbort, { once: true });
      });
    }
  }
}
