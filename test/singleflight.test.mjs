import { test } from 'node:test';
import assert from 'node:assert';
import { SingleFlightGroup, createSingleFlight } from '../dist/singleflight.js';

test('SingleFlightGroup coalesces concurrent calls with the same key into a single execution', async () => {
  const g = createSingleFlight();
  let executionCount = 0;

  const fn = async () => {
    executionCount++;
    await new Promise((r) => setTimeout(r, 40));
    return 'data-payload';
  };

  const [res1, res2, res3] = await Promise.all([
    g.do('user:100', fn),
    g.do('user:100', fn),
    g.do('user:100', fn),
  ]);

  assert.strictEqual(executionCount, 1, 'underlying task must be executed exactly once');
  assert.strictEqual(res1.val, 'data-payload');
  assert.strictEqual(res2.val, 'data-payload');
  assert.strictEqual(res3.val, 'data-payload');

  assert.strictEqual(res1.shared, false, 'first caller should not be shared');
  assert.strictEqual(res2.shared, true, 'second caller should be marked shared');
  assert.strictEqual(res3.shared, true, 'third caller should be marked shared');
});

test('SingleFlightGroup propagates errors to all concurrent callers if task rejects', async () => {
  const g = new SingleFlightGroup();
  let executionCount = 0;

  const failingFn = async () => {
    executionCount++;
    await new Promise((r) => setTimeout(r, 20));
    throw new Error('database connection reset');
  };

  const results = await Promise.allSettled([
    g.do('db:query', failingFn),
    g.do('db:query', failingFn),
  ]);

  assert.strictEqual(executionCount, 1);
  assert.strictEqual(results[0].status, 'rejected');
  assert.strictEqual(results[1].status, 'rejected');
  assert.strictEqual(results[0].reason.message, 'database connection reset');
  assert.strictEqual(results[1].reason.message, 'database connection reset');
});

test('SingleFlightGroup cleans up after execution so subsequent calls trigger a fresh execution', async () => {
  const g = new SingleFlightGroup();
  let executionCount = 0;

  const fn = async () => {
    executionCount++;
    return `result-${executionCount}`;
  };

  const res1 = await g.do('key:abc', fn);
  assert.strictEqual(res1.val, 'result-1');
  assert.strictEqual(res1.shared, false);

  // Subsequent call after first has completed
  const res2 = await g.do('key:abc', fn);
  assert.strictEqual(res2.val, 'result-2');
  assert.strictEqual(res2.shared, false);
  assert.strictEqual(executionCount, 2);
});

test('SingleFlightGroup execute wrapper returns value directly', async () => {
  const g = new SingleFlightGroup();
  const val = await g.execute('direct:key', async () => 'hello-world');
  assert.strictEqual(val, 'hello-world');
});

test('SingleFlightGroup forget allows in-flight key to be evicted early', async () => {
  const g = new SingleFlightGroup();
  let count = 0;

  const slowFn = async () => {
    const runId = ++count;
    await new Promise((r) => setTimeout(r, 60));
    return runId;
  };

  const p1 = g.do('forget:test', slowFn);
  assert.strictEqual(g.metrics().inFlightCount, 1);

  const forgotten = g.forget('forget:test');
  assert.strictEqual(forgotten, true);
  assert.strictEqual(g.metrics().inFlightCount, 0);

  // Starting another call with same key immediately starts a new execution
  const p2 = g.do('forget:test', slowFn);
  assert.strictEqual(count, 2);

  const [r1, r2] = await Promise.all([p1, p2]);
  assert.strictEqual(r1.val, 1);
  assert.strictEqual(r2.val, 2);
});

test('SingleFlightGroup maintains independent executions for different keys', async () => {
  const g = new SingleFlightGroup();
  const executedKeys = [];

  const fn = async (key) => {
    executedKeys.push(key);
    await new Promise((r) => setTimeout(r, 20));
    return `val-${key}`;
  };

  const [rA, rB] = await Promise.all([
    g.do('key:A', () => fn('A')),
    g.do('key:B', () => fn('B')),
  ]);

  assert.strictEqual(rA.val, 'val-A');
  assert.strictEqual(rB.val, 'val-B');
  assert.deepStrictEqual(executedKeys.sort(), ['A', 'B']);
});

test('SingleFlightGroup metrics tracks in-flight count and shared execution counters', async () => {
  const g = new SingleFlightGroup();

  assert.deepStrictEqual(g.metrics(), {
    inFlightCount: 0,
    activeKeys: [],
    totalCalls: 0,
    sharedExecutions: 0,
  });

  const slowTask = () => new Promise((r) => setTimeout(() => r('done'), 50));

  const p1 = g.do('k1', slowTask);
  const p2 = g.do('k1', slowTask);

  const midMetrics = g.metrics();
  assert.strictEqual(midMetrics.inFlightCount, 1);
  assert.deepStrictEqual(midMetrics.activeKeys, ['k1']);
  assert.strictEqual(midMetrics.totalCalls, 2);
  assert.strictEqual(midMetrics.sharedExecutions, 1);

  await Promise.all([p1, p2]);

  const endMetrics = g.metrics();
  assert.strictEqual(endMetrics.inFlightCount, 0);
  assert.strictEqual(endMetrics.totalCalls, 2);
  assert.strictEqual(endMetrics.sharedExecutions, 1);

  g.resetMetrics();
  assert.strictEqual(g.metrics().totalCalls, 0);
  assert.strictEqual(g.metrics().sharedExecutions, 0);
});
