export class DeadlineExceededError extends Error {
  constructor(message = 'Execution context deadline exceeded') {
    super(message);
    this.name = 'DeadlineExceededError';
  }
}

/**
 * Manages deadline propagation and remaining time budgets across nested async calls.
 */
export class DeadlineContext {
  private readonly deadlineEpochMs: number;
  private readonly abortController: AbortController;
  private readonly timer: NodeJS.Timeout | null = null;

  constructor(timeoutOrDeadlineMs: number, isAbsoluteEpoch = false) {
    this.abortController = new AbortController();
    if (isAbsoluteEpoch) {
      this.deadlineEpochMs = timeoutOrDeadlineMs;
    } else {
      this.deadlineEpochMs = Date.now() + Math.max(0, timeoutOrDeadlineMs);
    }

    const remaining = this.remainingMs;
    if (remaining <= 0) {
      this.abortController.abort();
    } else {
      this.timer = setTimeout(() => {
        this.abortController.abort();
      }, remaining);
      if (typeof this.timer.unref === 'function') {
        this.timer.unref();
      }
    }
  }

  get remainingMs(): number {
    return Math.max(0, this.deadlineEpochMs - Date.now());
  }

  get isExpired(): boolean {
    return this.remainingMs <= 0 || this.abortController.signal.aborted;
  }

  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  /**
   * Spawns a child context whose deadline cannot exceed the parent's deadline.
   */
  createChild(timeoutMs?: number): DeadlineContext {
    if (timeoutMs === undefined) {
      return new DeadlineContext(this.deadlineEpochMs, true);
    }
    const requestedDeadline = Date.now() + timeoutMs;
    const effectiveDeadline = Math.min(requestedDeadline, this.deadlineEpochMs);
    return new DeadlineContext(effectiveDeadline, true);
  }

  /**
   * Executes a task within the deadline budget, aborting if the deadline passes.
   */
  async run<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.isExpired) {
      throw new DeadlineExceededError();
    }

    let timeoutId: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new DeadlineExceededError());
      }, this.remainingMs);
    });

    try {
      return await Promise.race([fn(this.signal), timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
  }
}
