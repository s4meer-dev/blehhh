import test from 'node:test';
import assert from 'node:assert/strict';
import { DeadlineContext, DeadlineExceededError } from '../dist/deadline.js';

test('DeadlineContext tracks remaining budget', async () => {
  const ctx = new DeadlineContext(100);
  assert.equal(ctx.isExpired, false);
  assert.ok(ctx.remainingMs > 50 && ctx.remainingMs <= 100);

  await new Promise((r) => setTimeout(r, 40));
  assert.ok(ctx.remainingMs <= 65);
  ctx.dispose();
});

test('DeadlineContext expires and triggers abort signal', async () => {
  const ctx = new DeadlineContext(20);
  await new Promise((r) => setTimeout(r, 35));

  assert.equal(ctx.isExpired, true);
  assert.equal(ctx.signal.aborted, true);
  ctx.dispose();
});

test('DeadlineContext run throws DeadlineExceededError if expired', async () => {
  const ctx = new DeadlineContext(25);
  await assert.rejects(
    async () => {
      await ctx.run(async () => {
        await new Promise((r) => setTimeout(r, 60));
        return 'success';
      });
    },
    (err) => {
      assert.ok(err instanceof DeadlineExceededError);
      return true;
    }
  );
  ctx.dispose();
});

test('DeadlineContext createChild cannot exceed parent deadline', () => {
  const parent = new DeadlineContext(50);
  // Request child with 200ms timeout
  const child = parent.createChild(200);

  // Child must be bounded by parent's remaining budget (<= 50)
  assert.ok(child.remainingMs <= parent.remainingMs);
  parent.dispose();
  child.dispose();
});
