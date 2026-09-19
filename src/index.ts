/**
 * blehh ⚡
 * Ultra-lightweight resilience & fault-tolerance toolkit for TypeScript and Node.js.
 */

export const VERSION = '1.0.0';

// Retry & Backoff
export {
  retry,
  calculateBackoff,
  createRetryPolicy,
  RetryExhaustedError,
  type RetryOptions,
  type RetryPolicy,
  type JitterStrategy,
} from './retry.js';

// Circuit Breaker
export {
  CircuitBreaker,
  CircuitBreakerOpenError,
  type CircuitBreakerOptions,
  type CircuitBreakerMetrics,
  type CircuitState,
} from './circuit-breaker.js';

// Rate Limiting
export {
  TokenBucketRateLimiter,
  SlidingWindowRateLimiter,
  LeakyBucketRateLimiter,
  type TokenBucketOptions,
  type SlidingWindowOptions,
  type LeakyBucketOptions,
} from './rate-limiter.js';

// Observability Logger
export {
  Logger,
  type LoggerOptions,
  type LogLevel,
} from './logger.js';

// System Health Checks
export {
  HealthRegistry,
  type HealthRegistry as HealthRegistryType,
  type HealthIndicator,
  type HealthCheckFn,
  type HealthStatus,
  type SystemHealthReport,
} from './health.js';

// Resilient HTTP Client
export {
  ResilientClient,
  type ResilientClientOptions,
} from './client.js';

// Graceful Shutdown
export {
  GracefulShutdownCoordinator,
  type ShutdownOptions,
  type ShutdownHandler,
} from './shutdown.js';

// Bulkhead Concurrency Isolation
export {
  Bulkhead,
  BulkheadRejectedError,
  BulkheadTimeoutError,
  type BulkheadOptions,
  type BulkheadMetrics,
} from './bulkhead.js';

// Cache-aside & Memory Cache
export {
  MemoryCache,
  withCache,
  type CacheOptions,
  type WithCacheOptions,
  type EvictionPolicy,
} from './cache.js';

// Hedged Requests
export {
  hedgedRequest,
  AllHedgesFailedError,
  type HedgedRequestOptions,
} from './hedging.js';

// Deadline Propagation
export {
  DeadlineContext,
  DeadlineExceededError,
} from './deadline.js';

// Metrics & Telemetry
export {
  ResilienceMetricsCollector,
  type LatencySummary,
} from './metrics.js';

// Fallback & Graceful Degradation
export {
  withFallback,
  FallbackPolicy,
  type FallbackOptions,
  type FallbackHandler,
} from './fallback.js';

// High-level Toolkit Facade
import { CircuitBreaker, type CircuitBreakerOptions } from './circuit-breaker.js';
import { ResilientClient, type ResilientClientOptions } from './client.js';
import { HealthRegistry } from './health.js';
import { Logger, type LoggerOptions } from './logger.js';
import { GracefulShutdownCoordinator, type ShutdownOptions } from './shutdown.js';
import { Bulkhead, type BulkheadOptions } from './bulkhead.js';
import { MemoryCache, type CacheOptions } from './cache.js';
import { ResilienceMetricsCollector } from './metrics.js';

export interface ResilienceSuiteConfig {
  serviceName: string;
  circuitBreaker?: CircuitBreakerOptions;
  bulkhead?: BulkheadOptions;
  client?: ResilientClientOptions;
  logger?: LoggerOptions;
  shutdown?: ShutdownOptions;
  cache?: CacheOptions;
}

export function createResilienceSuite(config: ResilienceSuiteConfig) {
  const logger = new Logger({ service: config.serviceName, ...config.logger });
  const circuitBreaker = new CircuitBreaker(config.circuitBreaker);
  const bulkhead = new Bulkhead(config.bulkhead);
  const health = new HealthRegistry();
  const shutdown = new GracefulShutdownCoordinator(config.shutdown);
  const cache = new MemoryCache(config.cache);
  const metrics = new ResilienceMetricsCollector();
  const client = new ResilientClient({
    circuitBreaker,
    ...config.client,
  });

  return {
    serviceName: config.serviceName,
    circuitBreaker,
    bulkhead,
    health,
    logger,
    client,
    shutdown,
    cache,
    metrics,
  };
}
