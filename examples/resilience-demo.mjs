/**
 * blehh - End-to-End Resilience Suite Demonstration
 * Demonstrates combining Retry, CircuitBreaker, Bulkhead, Cache, and Metrics.
 */

import {
  createResilienceSuite,
  withFallback,
  withCache,
  hedgedRequest,
  DeadlineContext,
} from '../dist/index.js';

async function main() {
  console.log('⚡ Initializing blehh Resilience Suite...');

  const suite = createResilienceSuite({
    serviceName: 'payments-service',
    circuitBreaker: {
      failureThreshold: 3,
      recoveryTimeoutMs: 2000,
    },
    bulkhead: {
      maxConcurrent: 5,
      maxQueue: 10,
    },
  });

  // Track metrics
  suite.metrics.incrementCounter('service_start');

  // Demonstrate Cache-Aside
  const cacheKey = 'account:9876';
  const account = await withCache(
    async () => {
      suite.logger.info('Fetching account from database...');
      return { id: 9876, balance: 1500, tier: 'GOLD' };
    },
    { cache: suite.cache, key: cacheKey, ttlMs: 5000 }
  );
  console.log('✔ Account retrieved:', account);

  // Demonstrate Fallback
  const rate = await withFallback(
    async () => {
      // Simulate external FX service failure
      throw new Error('Exchange rate API unavailable');
    },
    {
      fallback: 1.08, // Cached static fallback rate
      onFallback: (err) => suite.logger.warn('Fell back to default EUR/USD rate', { error: err.message }),
    }
  );
  console.log('✔ Currency rate resolved via fallback:', rate);

  // Demonstrate Hedging
  const latencyResult = await hedgedRequest(
    async (signal, attempt) => {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 60));
      }
      return `Processed by attempt ${attempt}`;
    },
    { delayMs: 25, maxHedges: 1 }
  );
  console.log('✔ Hedged request completed:', latencyResult);

  // Export Prometheus metrics
  console.log('\n📊 Prometheus Exposition Output:');
  console.log(suite.metrics.toPrometheusFormat());

  console.log('\n✨ blehh demonstration finished successfully.');
}

main().catch(console.error);
