import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmark } from '../dist/benchmark.js';

test('benchmark executes iterations and measures throughput', async () => {
  let counter = 0;
  const result = await benchmark('counter-increment', () => { counter++; }, 1000);

  assert.equal(result.iterations, 1000);
  assert.ok(result.opsPerSecond > 0);
  assert.ok(result.avgLatencyUs >= 0);
  assert.equal(result.name, 'counter-increment');
});
