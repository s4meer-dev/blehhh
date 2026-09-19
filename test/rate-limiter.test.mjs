import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TokenBucketRateLimiter,
  SlidingWindowRateLimiter,
  LeakyBucketRateLimiter,
} from '../dist/rate-limiter.js';

test('token bucket enforces capacity limit', () => {
  const bucket = new TokenBucketRateLimiter({ capacity: 3, refillRate: 1, refillIntervalMs: 1000 });
  assert.equal(bucket.tryConsume(1), true);
  assert.equal(bucket.tryConsume(1), true);
  assert.equal(bucket.tryConsume(1), true);
  assert.equal(bucket.tryConsume(1), false);
});

test('sliding window rate limiter tracks requests in window', () => {
  const limiter = new SlidingWindowRateLimiter({ maxRequests: 2, windowMs: 1000 });
  assert.equal(limiter.tryConsume(), true);
  assert.equal(limiter.tryConsume(), true);
  assert.equal(limiter.tryConsume(), false);
  assert.equal(limiter.getRemainingQuota(), 0);
});

test('leaky bucket rate limiter limits capacity and leaks over time', async () => {
  const leaky = new LeakyBucketRateLimiter({
    capacity: 2,
    leakRate: 2,
    leakIntervalMs: 50, // leaks 2 items per 50ms (or 1 item per 25ms)
  });

  assert.equal(leaky.tryAdd(1), true);
  assert.equal(leaky.tryAdd(1), true);
  assert.equal(leaky.tryAdd(1), false); // Full!

  // Wait for it to leak
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(leaky.tryAdd(1), true); // Successfully added after leaking
});
