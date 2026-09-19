export type FallbackHandler<T> = (error: unknown) => Promise<T> | T;

export interface FallbackOptions<T> {
  /** Value or function returning a value/promise to resolve when primary execution fails */
  fallback: FallbackHandler<T> | T;
  /** Filter predicate to restrict fallback execution to specific errors */
  shouldHandle?: (error: unknown) => boolean;
  /** Notification hook invoked whenever a fallback is activated */
  onFallback?: (error: unknown) => void;
}

/**
 * Executes an async action and applies graceful degradation fallback on failure.
 */
export async function withFallback<T>(
  fn: () => Promise<T>,
  options: FallbackOptions<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (options.shouldHandle && !options.shouldHandle(error)) {
      throw error;
    }

    if (options.onFallback) {
      options.onFallback(error);
    }

    if (typeof options.fallback === 'function') {
      return await (options.fallback as FallbackHandler<T>)(error);
    }

    return options.fallback;
  }
}

/**
 * Encapsulates a reusable fallback policy.
 */
export class FallbackPolicy<T> {
  constructor(private readonly options: FallbackOptions<T>) {}

  async execute(fn: () => Promise<T>): Promise<T> {
    return withFallback(fn, this.options);
  }
}
