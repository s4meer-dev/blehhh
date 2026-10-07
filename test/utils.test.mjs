import test from 'node:test';
import assert from 'node:assert/strict';
import { sleep, timeout, TimeoutError, isAbortError } from '../dist/utils.js';

test('sleep resolves after specified milliseconds', async () => {
  const start = Date.now();
  await sleep(20);
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 15);
});

test('sleep aborts immediately when signal is aborted', async () => {
  const controller = new AbortController();
  controller.abort(new Error('User aborted'));

  await assert.rejects(
    async () => sleep(1000, controller.signal),
    /User aborted/
  );
});

test('timeout resolves if inner promise completes before timeout', async () => {
  const result = await timeout(Promise.resolve('OK'), 500);
  assert.equal(result, 'OK');
});

test('timeout rejects with TimeoutError if inner promise hangs', async () => {
  await assert.rejects(
    async () => timeout(new Promise((r) => setTimeout(r, 500)), 20),
    (err) => {
      assert.ok(err instanceof TimeoutError);
      return true;
    }
  );
});
