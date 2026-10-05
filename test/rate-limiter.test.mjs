import test from 'node:test';
import assert from 'node:assert/strict';
import { TokenBucketRateLimiter, SlidingWindowRateLimiter } from '../dist/rate-limiter.js';

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
