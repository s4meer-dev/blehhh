import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AdaptiveConcurrencyLimiter,
  AdaptiveLimiterRejectedError,
} from '../dist/adaptive-limiter.js';

test('AdaptiveConcurrencyLimiter executes tasks and records baseline latency', async () => {
  const limiter = new AdaptiveConcurrencyLimiter({
    initialLimit: 5,
    minLimit: 2,
    maxLimit: 20,
  });

  const result = await limiter.execute(async () => {
    await new Promise((r) => setTimeout(r, 10));
    return 'payload';
  });

  assert.equal(result, 'payload');
  const metrics = limiter.getMetrics();
  assert.equal(metrics.totalExecutions, 1);
  assert.equal(metrics.rejectedExecutions, 0);
  assert.ok(metrics.minRttMs > 0);
  assert.ok(metrics.currentLimit >= 5);
});

test('AdaptiveConcurrencyLimiter rejects requests when concurrency limit is saturated', async () => {
  const limiter = new AdaptiveConcurrencyLimiter({
    initialLimit: 2,
    minLimit: 1,
    maxLimit: 10,
  });

  // Launch 2 long-running tasks to saturate initialLimit
  const task1 = limiter.execute(() => new Promise((r) => setTimeout(r, 60)));
  const task2 = limiter.execute(() => new Promise((r) => setTimeout(r, 60)));

  // Third execution must reject immediately
  await assert.rejects(
    async () => limiter.execute(() => Promise.resolve('overflow')),
    (err) => {
      assert.ok(err instanceof AdaptiveLimiterRejectedError);
      return true;
    }
  );

  await Promise.all([task1, task2]);
  const metrics = limiter.getMetrics();
  assert.equal(metrics.rejectedExecutions, 1);
  assert.equal(metrics.totalExecutions, 2);
  assert.equal(metrics.activeExecutions, 0);
});

test('AdaptiveConcurrencyLimiter decreases limit upon latency degradation', async () => {
  const limiter = new AdaptiveConcurrencyLimiter({
    initialLimit: 10,
    minLimit: 2,
    maxLimit: 30,
    backoffRatio: 0.5,
    toleranceFactor: 1.2,
    smoothingAlpha: 0.8,
  });

  // Fast baseline request to anchor minRTT
  await limiter.execute(() => new Promise((r) => setTimeout(r, 5)));
  const baseMetrics = limiter.getMetrics();
  assert.ok(baseMetrics.minRttMs <= 30);

  // Severe latency spike (congestion)
  await limiter.execute(() => new Promise((r) => setTimeout(r, 100)));

  const afterSpikeMetrics = limiter.getMetrics();
  assert.ok(afterSpikeMetrics.congestionEvents >= 1);
  assert.ok(afterSpikeMetrics.currentLimit < baseMetrics.currentLimit);
});

test('AdaptiveConcurrencyLimiter allows manual limit override', () => {
  const limiter = new AdaptiveConcurrencyLimiter({
    initialLimit: 5,
    minLimit: 2,
    maxLimit: 50,
  });

  limiter.setLimit(25);
  assert.equal(limiter.getMetrics().currentLimit, 25);

  limiter.setLimit(100); // capped at maxLimit (50)
  assert.equal(limiter.getMetrics().currentLimit, 50);

  limiter.setLimit(1); // floor at minLimit (2)
  assert.equal(limiter.getMetrics().currentLimit, 2);
});
