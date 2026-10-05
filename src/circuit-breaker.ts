import { EventEmitter } from 'node:events';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Maximum number of consecutive failures before opening breaker (default: 5) */
  failureThreshold?: number;
  /** Cooldown time in ms before transitioning from OPEN to HALF_OPEN (default: 10000) */
  recoveryTimeoutMs?: number;
  /** Number of successful probe calls in HALF_OPEN to close breaker (default: 2) */
  successThreshold?: number;
  /** Maximum concurrent probe requests allowed in HALF_OPEN state (default: 1) */
  halfOpenConcurrencyLimit?: number;
  /** Optional fallback handler invoked when breaker is OPEN or call fails */
  fallback?: (error: Error) => unknown;
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  totalCalls: number;
  totalFailures: number;
  totalRejections: number;
  lastStateChange: string;
}

export class CircuitBreakerOpenError extends Error {
  constructor(message = 'Circuit breaker is OPEN. Fast-failing request.') {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private totalCalls = 0;
  private totalFailures = 0;
  private totalRejections = 0;
  private lastStateChange: Date = new Date();
  private nextAttemptTimestamp = 0;
  private activeHalfOpenProbes = 0;

  private readonly failureThreshold: number;
  private readonly recoveryTimeoutMs: number;
  private readonly successThreshold: number;
  private readonly halfOpenConcurrencyLimit: number;
  private readonly fallback?: (error: Error) => unknown;

  constructor(options: CircuitBreakerOptions = {}) {
    super();
    this.failureThreshold = options.failureThreshold ?? 5;
    this.recoveryTimeoutMs = options.recoveryTimeoutMs ?? 10000;
    this.successThreshold = options.successThreshold ?? 2;
    this.halfOpenConcurrencyLimit = options.halfOpenConcurrencyLimit ?? 1;
    this.fallback = options.fallback;
  }

  public getState(): CircuitState {
    this.checkCooldown();
    return this.state;
  }

  public getMetrics(): CircuitBreakerMetrics {
    this.checkCooldown();
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures,
      totalRejections: this.totalRejections,
      lastStateChange: this.lastStateChange.toISOString(),
    };
  }

  public async execute<T>(action: () => Promise<T>): Promise<T> {
    this.totalCalls++;
    this.checkCooldown();

    if (this.state === 'OPEN') {
      this.totalRejections++;
      const openErr = new CircuitBreakerOpenError();
      this.emit('reject', openErr);
      if (this.fallback) {
        return this.fallback(openErr) as T;
      }
      throw openErr;
    }

    if (this.state === 'HALF_OPEN') {
      if (this.activeHalfOpenProbes >= this.halfOpenConcurrencyLimit) {
        this.totalRejections++;
        const probeErr = new CircuitBreakerOpenError('Circuit breaker is HALF_OPEN and probe quota is reached.');
        this.emit('reject', probeErr);
        if (this.fallback) {
          return this.fallback(probeErr) as T;
        }
        throw probeErr;
      }
      this.activeHalfOpenProbes++;
    }

    try {
      const result = await action();
      this.handleSuccess();
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.handleFailure(error);
      if (this.fallback) {
        return this.fallback(error) as T;
      }
      throw error;
    } finally {
      if (this.state === 'HALF_OPEN') {
        this.activeHalfOpenProbes = Math.max(0, this.activeHalfOpenProbes - 1);
      }
    }
  }

  private handleSuccess(): void {
    this.emit('success');
    if (this.state === 'HALF_OPEN') {
      this.consecutiveSuccesses++;
      if (this.consecutiveSuccesses >= this.successThreshold) {
        this.transitionTo('CLOSED');
      }
    } else {
      this.consecutiveFailures = 0;
    }
  }

  private handleFailure(error: Error): void {
    this.totalFailures++;
    this.emit('failure', error);

    if (this.state === 'HALF_OPEN') {
      this.transitionTo('OPEN');
    } else {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.failureThreshold) {
        this.transitionTo('OPEN');
      }
    }
  }

  private checkCooldown(): void {
    if (this.state === 'OPEN' && Date.now() >= this.nextAttemptTimestamp) {
      this.transitionTo('HALF_OPEN');
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    if (oldState === newState) return;

    this.state = newState;
    this.lastStateChange = new Date();

    if (newState === 'OPEN') {
      this.nextAttemptTimestamp = Date.now() + this.recoveryTimeoutMs;
      this.consecutiveSuccesses = 0;
    } else if (newState === 'CLOSED') {
      this.consecutiveFailures = 0;
      this.consecutiveSuccesses = 0;
    } else if (newState === 'HALF_OPEN') {
      this.consecutiveSuccesses = 0;
      this.activeHalfOpenProbes = 0;
    }

    this.emit('stateChange', { from: oldState, to: newState });
  }

  public reset(): void {
    this.transitionTo('CLOSED');
  }
}
