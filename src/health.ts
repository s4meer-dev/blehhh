/**
 * blehh - Health Check and Liveness / Readiness Probe Registry
 */

export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';

export interface HealthIndicatorResult {
  status: 'UP' | 'DOWN';
  message?: string;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

export type HealthCheckFn = () => Promise<{ status: 'UP' | 'DOWN'; message?: string; metadata?: Record<string, unknown> }>;

export interface HealthIndicator {
  name: string;
  critical?: boolean;
  timeoutMs?: number;
  check: HealthCheckFn;
}

export interface SystemHealthReport {
  status: HealthStatus;
  timestamp: string;
  uptimeSeconds: number;
  memoryUsageMb: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
  };
  checks: Record<string, HealthIndicatorResult>;
}

export class HealthRegistry {
  private readonly indicators: Map<string, HealthIndicator> = new Map();

  public register(indicator: HealthIndicator): this {
    this.indicators.set(indicator.name, indicator);
    return this;
  }

  public unregister(name: string): boolean {
    return this.indicators.delete(name);
  }

  public async getReport(): Promise<SystemHealthReport> {
    const checks: Record<string, HealthIndicatorResult> = {};
    let hasCriticalFailure = false;
    let hasNonCriticalFailure = false;

    const memory = process.memoryUsage();
    const memoryUsageMb = {
      heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
      rss: Math.round(memory.rss / 1024 / 1024),
    };

    const entries = Array.from(this.indicators.entries());

    await Promise.all(
      entries.map(async ([name, indicator]) => {
        const start = Date.now();
        const timeoutMs = indicator.timeoutMs ?? 3000;

        try {
          const checkPromise = indicator.check();
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Health check timed out after ${timeoutMs}ms`)), timeoutMs)
          );

          const result = await Promise.race([checkPromise, timeoutPromise]);
          const durationMs = Date.now() - start;

          checks[name] = {
            status: result.status,
            message: result.message,
            durationMs,
            metadata: result.metadata,
          };

          if (result.status === 'DOWN') {
            if (indicator.critical !== false) {
              hasCriticalFailure = true;
            } else {
              hasNonCriticalFailure = true;
            }
          }
        } catch (err) {
          const durationMs = Date.now() - start;
          const message = err instanceof Error ? err.message : String(err);

          checks[name] = {
            status: 'DOWN',
            message,
            durationMs,
          };

          if (indicator.critical !== false) {
            hasCriticalFailure = true;
          } else {
            hasNonCriticalFailure = true;
          }
        }
      })
    );

    let status: HealthStatus = 'HEALTHY';
    if (hasCriticalFailure) {
      status = 'UNHEALTHY';
    } else if (hasNonCriticalFailure) {
      status = 'DEGRADED';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      memoryUsageMb,
      checks,
    };
  }
}
