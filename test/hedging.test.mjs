import test from 'node:test';
import assert from 'node:assert/strict';
import { hedgedRequest, AllHedgesFailedError } from '../dist/hedging.js';

test('hedgedRequest returns primary when primary completes before delay', async () => {
  let attempts = 0;
  const res = await hedgedRequest(
    async (signal, attempt) => {
      attempts++;
      return 'fast-primary';
    },
    { delayMs: 50, maxHedges: 2 }
  );

  assert.equal(res, 'fast-primary');
  assert.equal(attempts, 1);
});

test('hedgedRequest triggers hedge when primary exceeds delay threshold', async () => {
  let attempts = 0;
  let abortedCount = 0;

  const res = await hedgedRequest(
    async (signal, attempt) => {
      attempts++;
      signal.addEventListener('abort', () => abortedCount++);

      if (attempt === 0) {
        // Slow primary
        await new Promise((r) => setTimeout(r, 100));
        return 'slow-primary';
      }
      // Fast secondary hedge
      return 'fast-hedge';
    },
    { delayMs: 20, maxHedges: 1 }
  );

  assert.equal(res, 'fast-hedge');
  assert.equal(attempts, 2);
  assert.equal(abortedCount, 1); // primary got aborted
});

test('hedgedRequest throws AllHedgesFailedError when all fail', async () => {
  await assert.rejects(
    async () => {
      await hedgedRequest(
        async () => {
          throw new Error('downstream timeout');
        },
        { delayMs: 10, maxHedges: 2 }
      );
    },
    (err) => {
      assert.ok(err instanceof AllHedgesFailedError);
      assert.equal(err.errors.length, 3);
      return true;
    }
  );
});
