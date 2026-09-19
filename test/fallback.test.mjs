import test from 'node:test';
import assert from 'node:assert/strict';
import { withFallback, FallbackPolicy } from '../dist/fallback.js';

test('withFallback returns primary result on success without triggering fallback', async () => {
  let fallbackInvoked = false;
  const res = await withFallback(
    async () => 'primary-data',
    {
      fallback: () => {
        fallbackInvoked = true;
        return 'fallback-data';
      },
    }
  );

  assert.equal(res, 'primary-data');
  assert.equal(fallbackInvoked, false);
});

test('withFallback resolves fallback value or handler on failure', async () => {
  let notifiedError = null;
  const res = await withFallback(
    async () => {
      throw new Error('primary service unavailable');
    },
    {
      fallback: (err) => `recovered: ${err.message}`,
      onFallback: (err) => {
        notifiedError = err;
      },
    }
  );

  assert.equal(res, 'recovered: primary service unavailable');
  assert.ok(notifiedError instanceof Error);
});

test('withFallback respects shouldHandle predicate', async () => {
  class CriticalFatalError extends Error {}

  await assert.rejects(
    async () => {
      await withFallback(
        async () => {
          throw new CriticalFatalError('fatal database corrupt');
        },
        {
          fallback: 'static-default',
          shouldHandle: (err) => !(err instanceof CriticalFatalError),
        }
      );
    },
    (err) => err instanceof CriticalFatalError
  );
});

test('FallbackPolicy executes with reusable configuration', async () => {
  const policy = new FallbackPolicy({ fallback: 'cached-fallback' });
  const result = await policy.execute(async () => {
    throw new Error('service down');
  });
  assert.equal(result, 'cached-fallback');
});
