import { EventEmitter } from 'node:events';

export interface BulkheadOptions {
  /** Maximum number of concurrent executions permitted (default: 5) */
  maxConcurrent?: number;
  /** Maximum number of executions waiting in queue (default: 10) */
  maxQueue?: number;
  /** Optional execution timeout in milliseconds for each operation */
  timeoutMs?: number;
  /** Optional fallback handler invoked when bulkhead rejects or execution fails */
  fallback?: (error: Error) => unknown;
}

export interface BulkheadMetrics {
  activeExecutions: number;
  queuedExecutions: number;
  maxConcurrent: number;
  maxQueue: number;
  completedCount: number;
  rejectedCount: number;
  timedOutCount: number;
}

export class BulkheadRejectedError extends Error {
  constructor(message = 'Bulkhead execution limit exceeded and queue is full') {
    super(message);
    this.name = 'BulkheadRejectedError';
  }
}

export class BulkheadTimeoutError extends Error {
  constructor(message = 'Bulkhead execution exceeded timeout limit') {
    super(message);
    this.name = 'BulkheadTimeoutError';
  }
}

interface QueuedTask<T> {
  action: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  timeoutTimer?: NodeJS.Timeout;
}

/**
 * Bulkhead Isolation Engine
 * Prevents cascaded failure and resource starvation by enforcing strict concurrency partitions.
 */
export class Bulkhead extends EventEmitter {
  private readonly maxConcurrent: number;
  private readonly maxQueue: number;
  private readonly timeoutMs?: number;
  private readonly fallback?: (error: Error) => unknown;

  private activeExecutions = 0;
  private readonly queue: QueuedTask<unknown>[] = [];
  private completedCount = 0;
  private rejectedCount = 0;
  private timedOutCount = 0;

  constructor(options: BulkheadOptions = {}) {
    super();
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? 5);
    this.maxQueue = Math.max(0, options.maxQueue ?? 10);
    this.timeoutMs = options.timeoutMs;
    this.fallback = options.fallback;
  }

  public getMetrics(): BulkheadMetrics {
    return {
      activeExecutions: this.activeExecutions,
      queuedExecutions: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      maxQueue: this.maxQueue,
      completedCount: this.completedCount,
      rejectedCount: this.rejectedCount,
      timedOutCount: this.timedOutCount,
    };
  }

  public async execute<T>(action: () => Promise<T>): Promise<T> {
    if (this.activeExecutions < this.maxConcurrent) {
      return this.runTask(action);
    }

    if (this.queue.length >= this.maxQueue) {
      this.rejectedCount++;
      const rejectionError = new BulkheadRejectedError(
        `Bulkhead concurrency limit (${this.maxConcurrent}) and queue capacity (${this.maxQueue}) saturated.`
      );
      this.emit('reject', rejectionError);

      if (this.fallback) {
        return this.fallback(rejectionError) as T;
      }
      throw rejectionError;
    }

    return new Promise<T>((resolve, reject) => {
      const task: QueuedTask<T> = {
        action,
        resolve: resolve as (value: unknown) => void,
        reject,
      };

      if (this.timeoutMs && this.timeoutMs > 0) {
        task.timeoutTimer = setTimeout(() => {
          const idx = this.queue.indexOf(task as QueuedTask<unknown>);
          if (idx !== -1) {
            this.queue.splice(idx, 1);
            this.timedOutCount++;
            const timeoutErr = new BulkheadTimeoutError(
              `Queued operation timed out after ${this.timeoutMs}ms in bulkhead queue.`
            );
            this.emit('timeout', timeoutErr);
            if (this.fallback) {
              resolve(this.fallback(timeoutErr) as T);
            } else {
              reject(timeoutErr);
            }
          }
        }, this.timeoutMs);
      }

      this.queue.push(task as QueuedTask<unknown>);
      this.emit('queued', { queueLength: this.queue.length });
    });
  }

  private async runTask<T>(action: () => Promise<T>): Promise<T> {
    this.activeExecutions++;
    this.emit('execute', { activeExecutions: this.activeExecutions });

    let timer: NodeJS.Timeout | undefined;
    let timedOut = false;

    const timeoutPromise = this.timeoutMs && this.timeoutMs > 0
      ? new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            timedOut = true;
            this.timedOutCount++;
            const err = new BulkheadTimeoutError(`Bulkhead execution timed out after ${this.timeoutMs}ms.`);
            this.emit('timeout', err);
            reject(err);
          }, this.timeoutMs);
        })
      : null;

    try {
      const execPromise = action();
      const result = timeoutPromise ? await Promise.race([execPromise, timeoutPromise]) : await execPromise;
      this.completedCount++;
      this.emit('complete', { activeExecutions: this.activeExecutions - 1 });
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (!timedOut) {
        this.emit('error', error);
      }
      if (this.fallback) {
        return this.fallback(error) as T;
      }
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
      this.activeExecutions--;
      this.dequeueNext();
    }
  }

  private dequeueNext(): void {
    if (this.activeExecutions >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const nextTask = this.queue.shift();
    if (!nextTask) return;

    if (nextTask.timeoutTimer) {
      clearTimeout(nextTask.timeoutTimer);
    }

    this.runTask(nextTask.action)
      .then(nextTask.resolve)
      .catch(nextTask.reject);
  }

  public clearQueue(): void {
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task?.timeoutTimer) {
        clearTimeout(task.timeoutTimer);
      }
      if (task) {
        this.rejectedCount++;
        const cancelErr = new BulkheadRejectedError('Bulkhead queue cleared.');
        task.reject(cancelErr);
      }
    }
  }
}
