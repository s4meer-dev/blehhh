/**
 * blehh - Graceful Shutdown Coordinator
 */

export type ShutdownHandler = () => Promise<void> | void;

export interface ShutdownOptions {
  /** Maximum grace period in milliseconds before forced process termination (default: 10000) */
  timeoutMs?: number;
  /** Signals to listen to (default: ['SIGINT', 'SIGTERM']) */
  signals?: NodeJS.Signals[];
  /** Custom logger function for shutdown lifecycle events */
  logFn?: (msg: string) => void;
}

export class GracefulShutdownCoordinator {
  private isShuttingDown = false;
  private readonly handlers: Array<{ name: string; fn: ShutdownHandler }> = [];
  private readonly timeoutMs: number;
  private readonly signals: NodeJS.Signals[];
  private readonly logFn: (msg: string) => void;

  constructor(options: ShutdownOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.signals = options.signals ?? ['SIGINT', 'SIGTERM'];
    this.logFn = options.logFn ?? ((msg) => console.log(`[SHUTDOWN] ${msg}`));
  }

  public register(name: string, fn: ShutdownHandler): this {
    this.handlers.push({ name, fn });
    return this;
  }

  public bindProcessSignals(): this {
    for (const signal of this.signals) {
      process.on(signal, () => {
        this.logFn(`Received termination signal: ${signal}`);
        void this.shutdown(0);
      });
    }

    process.on('uncaughtException', (err) => {
      this.logFn(`Uncaught exception detected: ${err.message}`);
      void this.shutdown(1);
    });

    process.on('unhandledRejection', (reason) => {
      this.logFn(`Unhandled promise rejection: ${String(reason)}`);
      void this.shutdown(1);
    });

    return this;
  }

  public async shutdown(exitCode = 0): Promise<void> {
    if (this.isShuttingDown) {
      this.logFn('Shutdown already in progress. Ignoring duplicate trigger.');
      return;
    }

    this.isShuttingDown = true;
    this.logFn(`Beginning graceful teardown of ${this.handlers.length} registered service hooks...`);

    // Hard safety timer
    const watchdogTimer = setTimeout(() => {
      this.logFn(`Forced shutdown: Teardown exceeded ${this.timeoutMs}ms grace period.`);
      process.exit(1);
    }, this.timeoutMs);

    watchdogTimer.unref();

    for (const handler of this.handlers) {
      try {
        this.logFn(`Running teardown hook: ${handler.name}...`);
        await handler.fn();
        this.logFn(`Teardown hook completed: ${handler.name}`);
      } catch (err) {
        this.logFn(`Error executing teardown hook ${handler.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    clearTimeout(watchdogTimer);
    this.logFn('All teardown hooks finished successfully. Exiting.');
    process.exit(exitCode);
  }
}
