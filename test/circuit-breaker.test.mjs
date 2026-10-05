import test from 'node:test';
import assert from 'node:assert/strict';
import { CircuitBreaker, CircuitBreakerOpenError } from '../dist/circuit-breaker.js';

test('circuit breaker executes normally when CLOSED', async () => {
  const breaker = new CircuitBreaker();
  const res = await breaker.execute(async () => 42);
  assert.equal(res, 42);
  assert.equal(breaker.getState(), 'CLOSED');
});

test('circuit breaker trips to OPEN after reaching failure threshold', async () => {
  const breaker = new CircuitBreaker({ failureThreshold: 3, recoveryTimeoutMs: 100 });

  for (let i = 0; i < 3; i++) {
    await assert.rejects(
      async () => breaker.execute(async () => { throw new Error('subsystem down'); }),
      /subsystem down/
    );
  }

  assert.equal(breaker.getState(), 'OPEN');

  // Next call should fast-fail without running the action
  let called = false;
  await assert.rejects(
    async () => breaker.execute(async () => { called = true; }),
    (err) => {
      assert.ok(err instanceof CircuitBreakerOpenError);
      return true;
    }
  );
  assert.equal(called, false);
});
