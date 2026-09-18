export interface HedgedRequestOptions {
  /** Delay in milliseconds before launching a speculative hedged attempt */
  delayMs: number;
  /** Maximum number of speculative attempts to launch (default: 1) */
  maxHedges?: number;
}

export class AllHedgesFailedError extends Error {
  public readonly errors: Error[];

  constructor(errors: Error[]) {
    super(`All hedged requests failed (${errors.length} attempts)`);
    this.name = 'AllHedgesFailedError';
    this.errors = errors;
  }
}

/**
 * Hedged requests race a primary request against speculative backup requests
 * after a specified threshold to eliminate tail latencies (p99).
 */
export async function hedgedRequest<T>(
  fn: (signal: AbortSignal, attempt: number) => Promise<T>,
  options: HedgedRequestOptions
): Promise<T> {
  const maxHedges = options.maxHedges ?? 1;
  const abortControllers: AbortController[] = [];
  const errors: Error[] = [];
  let completed = false;

  return new Promise<T>((resolve, reject) => {
    let activeAttempts = 0;
    let scheduledHedges = 0;
    const timers: NodeJS.Timeout[] = [];

    const cleanup = () => {
      timers.forEach((t) => clearTimeout(t));
    };

    const abortAllExcept = (winnerIndex: number) => {
      abortControllers.forEach((controller, idx) => {
        if (idx !== winnerIndex && !controller.signal.aborted) {
          controller.abort();
        }
      });
    };

    const launchAttempt = (attemptIndex: number) => {
      if (completed) return;

      const controller = new AbortController();
      abortControllers[attemptIndex] = controller;
      activeAttempts++;

      fn(controller.signal, attemptIndex)
        .then((result) => {
          if (!completed) {
            completed = true;
            cleanup();
            abortAllExcept(attemptIndex);
            resolve(result);
          }
        })
        .catch((err) => {
          if (!completed) {
            errors.push(err instanceof Error ? err : new Error(String(err)));
            activeAttempts--;

            if (activeAttempts === 0 && scheduledHedges >= maxHedges) {
              completed = true;
              cleanup();
              reject(new AllHedgesFailedError(errors));
            }
          }
        });
    };

    // Launch initial request
    launchAttempt(0);

    // Schedule speculative hedges
    for (let i = 1; i <= maxHedges; i++) {
      const hedgeIndex = i;
      const timer = setTimeout(() => {
        if (!completed) {
          scheduledHedges++;
          launchAttempt(hedgeIndex);
        }
      }, options.delayMs * i);
      timers.push(timer);
    }
  });
}
