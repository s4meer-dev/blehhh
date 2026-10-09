import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Bulkhead,
  BulkheadRejectedError,
  BulkheadTimeoutError,
} from '../dist/bulkhead.js';

test('bulkhead executes task concurrently up to maxConcurrent', async () => {
  const bulkhead = new Bulkhead({ maxConcurrent: 2, maxQueue: 5 });
  let active = 0;
  let maxObservedActive = 0;

  const makeTask = (delayMs) => async () => {
    active++;
    maxObservedActive = Math.max(maxObservedActive, active);
    await new Promise((r) => setTimeout(r, delayMs));
    active--;
    return 'done';
  };

  const results = await Promise.all([
    bulkhead.execute(makeTask(30)),
    bulkhead.execute(makeTask(30)),
    bulkhead.execute(makeTask(30)),
    bulkhead.execute(makeTask(30)),
  ]);

  assert.equal(results.length, 4);
  assert.equal(results.every((r) => r === 'done'), true);
  assert.equal(maxObservedActive, 2);

  const metrics = bulkhead.getMetrics();
  assert.equal(metrics.completedCount, 4);
  assert.equal(metrics.activeExecutions, 0);
  assert.equal(metrics.queuedExecutions, 0);
});

test('bulkhead rejects requests when maxConcurrent and maxQueue are saturated', async () => {
  const bulkhead = new Bulkhead({ maxConcurrent: 1, maxQueue: 1 });

  // 1 executing, 1 in queue, 3rd must reject
  const task1 = bulkhead.execute(() => new Promise((r) => setTimeout(r, 50)));
  const task2 = bulkhead.execute(() => new Promise((r) => setTimeout(r, 50)));

  await assert.rejects(
    async () => bulkhead.execute(() => Promise.resolve('overflow')),
    (err) => {
      assert.ok(err instanceof BulkheadRejectedError);
      return true;
    }
  );

  await Promise.all([task1, task2]);
  const metrics = bulkhead.getMetrics();
  assert.equal(metrics.rejectedCount, 1);
  assert.equal(metrics.completedCount, 2);
});

test('bulkhead fallback handler is called on rejection', async () => {
  const bulkhead = new Bulkhead({
    maxConcurrent: 1,
    maxQueue: 0,
    fallback: (err) => `fallback-value:${err.name}`,
  });

  const task1 = bulkhead.execute(() => new Promise((r) => setTimeout(r, 40)));
  const fallbackResult = await bulkhead.execute(() => Promise.resolve('rejected'));

  assert.equal(fallbackResult, 'fallback-value:BulkheadRejectedError');
  await task1;
});

test('bulkhead times out long running tasks when timeoutMs is set', async () => {
  const bulkhead = new Bulkhead({
    maxConcurrent: 2,
    maxQueue: 2,
    timeoutMs: 25,
  });

  await assert.rejects(
    async () => bulkhead.execute(() => new Promise((r) => setTimeout(r, 100))),
    (err) => {
      assert.ok(err instanceof BulkheadTimeoutError);
      return true;
    }
  );

  const metrics = bulkhead.getMetrics();
  assert.equal(metrics.timedOutCount, 1);
});

test('bulkhead clearQueue rejects pending items', async () => {
  const bulkhead = new Bulkhead({ maxConcurrent: 1, maxQueue: 5 });

  const running = bulkhead.execute(() => new Promise((r) => setTimeout(r, 50)));
  const queued1 = bulkhead.execute(() => Promise.resolve('q1'));
  const queued2 = bulkhead.execute(() => Promise.resolve('q2'));

  bulkhead.clearQueue();

  await assert.rejects(queued1, /Bulkhead queue cleared/);
  await assert.rejects(queued2, /Bulkhead queue cleared/);
  await running;
});
