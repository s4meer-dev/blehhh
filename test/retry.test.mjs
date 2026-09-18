import test from 'node:test';
import assert from 'node:assert/strict';
import { retry, calculateBackoff, RetryExhaustedError, createRetryPolicy } from '../dist/retry.js';

test('calculateBackoff respects maxDelayMs and factor', () => {
  const delay1 = calculateBackoff(1, 100, 1000, 2, 'none');
  assert.equal(delay1, 100);

  const delay2 = calculateBackoff(2, 100, 1000, 2, 'none');
  assert.equal(delay2, 200);

  const delayCapped = calculateBackoff(10, 100, 1000, 2, 'none');
  assert.equal(delayCapped, 1000);
});

test('calculateBackoff respects full and decorrelated jitter bounds', () => {
  for (let i = 1; i <= 5; i++) {
    const fullJitter = calculateBackoff(i, 50, 500, 2, 'full');
    assert.ok(fullJitter >= 0 && fullJitter <= 500);

    const decorrelated = calculateBackoff(i, 50, 500, 2, 'decorrelated', 100);
    assert.ok(decorrelated >= 50 && decorrelated <= 500);
  }
});

test('createRetryPolicy executes correctly with pre-set policy', async () => {
  const policy = createRetryPolicy({ maxRetries: 2, baseDelayMs: 5, jitter: 'none' });
  let attempts = 0;
  const res = await policy.execute(async (att) => {
    attempts = att;
    if (att < 2) throw new Error('temporary');
    return 'ok';
  });
  assert.equal(res, 'ok');
  assert.equal(attempts, 2);
});

test('retry resolves on first successful attempt', async () => {
  let attempts = 0;
  const result = await retry(async (i) => {
    attempts = i;
    return 'SUCCESS';
  });

  assert.equal(result, 'SUCCESS');
  assert.equal(attempts, 1);
});

test('retry recovers after transient failures', async () => {
  let callCount = 0;
  const result = await retry(
    async () => {
      callCount++;
      if (callCount < 3) {
        throw new Error('transient network spike');
      }
      return 'recovered';
    },
    { maxRetries: 3, baseDelayMs: 5, jitter: 'none' }
  );

  assert.equal(result, 'recovered');
  assert.equal(callCount, 3);
});

test('retry throws RetryExhaustedError when attempts exceed limit', async () => {
  let callCount = 0;
  await assert.rejects(
    async () => {
      await retry(
        async () => {
          callCount++;
          throw new Error('fatal connection error');
        },
        { maxRetries: 2, baseDelayMs: 5, jitter: 'none' }
      );
    },
    (err) => {
      assert.ok(err instanceof RetryExhaustedError);
      assert.equal(err.attempts, 3); // initial + 2 retries
      return true;
    }
  );
});
