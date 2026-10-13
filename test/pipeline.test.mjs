import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PolicyPipeline,
  composePolicies,
} from '../dist/pipeline.js';
import { FallbackPolicy } from '../dist/fallback.js';
import { CircuitBreaker } from '../dist/circuit-breaker.js';
import { Bulkhead } from '../dist/bulkhead.js';

test('PolicyPipeline executes action directly when empty', async () => {
  const pipeline = new PolicyPipeline();
  const result = await pipeline.execute(async () => 'success');
  assert.equal(result, 'success');
  assert.equal(pipeline.getPolicyCount(), 0);

  const metrics = pipeline.getMetrics();
  assert.equal(metrics.totalExecutions, 1);
  assert.equal(metrics.successfulExecutions, 1);
  assert.equal(metrics.failedExecutions, 0);
});

test('PolicyPipeline executes policies in outer-to-inner order', async () => {
  const pipeline = new PolicyPipeline();
  const executionOrder = [];

  const policy1 = {
    name: 'Policy1',
    async execute(action) {
      executionOrder.push('p1-before');
      const res = await action();
      executionOrder.push('p1-after');
      return res;
    },
  };

  const policy2 = {
    name: 'Policy2',
    async execute(action) {
      executionOrder.push('p2-before');
      const res = await action();
      executionOrder.push('p2-after');
      return res;
    },
  };

  pipeline.use(policy1).use(policy2);
  assert.deepEqual(pipeline.getPolicyNames(), ['Policy1', 'Policy2']);

  const result = await pipeline.execute(async () => {
    executionOrder.push('action');
    return 42;
  });

  assert.equal(result, 42);
  assert.deepEqual(executionOrder, [
    'p1-before',
    'p2-before',
    'action',
    'p2-after',
    'p1-after',
  ]);
});

test('PolicyPipeline catches errors with outer FallbackPolicy', async () => {
  const fallback = new FallbackPolicy({
    fallback: () => 'degraded-value',
  });

  const failingPolicy = {
    name: 'FailingInner',
    async execute() {
      throw new Error('Downstream dependency unreachable');
    },
  };

  const pipeline = composePolicies(fallback, failingPolicy);
  const result = await pipeline.execute(async () => 'normal');

  assert.equal(result, 'degraded-value');
  const metrics = pipeline.getMetrics();
  assert.equal(metrics.successfulExecutions, 1);
});

test('PolicyPipeline composes with Bulkhead and CircuitBreaker', async () => {
  const bulkhead = new Bulkhead({ maxConcurrent: 2, maxQueue: 2 });
  const circuitBreaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000 });

  const pipeline = new PolicyPipeline({ name: 'EnterpriseGatewayPipeline' })
    .pipe(circuitBreaker, 'CircuitBreaker')
    .pipe(bulkhead, 'Bulkhead');

  assert.equal(pipeline.getPolicyCount(), 2);
  assert.deepEqual(pipeline.getPolicyNames(), ['CircuitBreaker', 'Bulkhead']);

  const results = await Promise.all([
    pipeline.execute(async () => 'res-1'),
    pipeline.execute(async () => 'res-2'),
  ]);

  assert.deepEqual(results, ['res-1', 'res-2']);
  const metrics = pipeline.getMetrics();
  assert.equal(metrics.totalExecutions, 2);
  assert.equal(metrics.successfulExecutions, 2);
});

test('PolicyPipeline tracks failed executions and propagates errors when unhandled', async () => {
  const pipeline = new PolicyPipeline();
  let caughtHookError = null;

  const hookedPipeline = new PolicyPipeline({
    hooks: {
      onError: (err) => {
        caughtHookError = err;
      },
    },
  });

  await assert.rejects(
    hookedPipeline.execute(async () => {
      throw new Error('Fatal database connection error');
    }),
    /Fatal database connection error/
  );

  assert.ok(caughtHookError instanceof Error);
  const metrics = hookedPipeline.getMetrics();
  assert.equal(metrics.totalExecutions, 1);
  assert.equal(metrics.failedExecutions, 1);
  assert.equal(metrics.successfulExecutions, 0);

  hookedPipeline.resetMetrics();
  assert.equal(hookedPipeline.getMetrics().totalExecutions, 0);
});
