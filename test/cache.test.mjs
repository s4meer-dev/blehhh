import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryCache, withCache } from '../dist/cache.js';

test('MemoryCache stores and retrieves values', () => {
  const cache = new MemoryCache();
  cache.set('key1', 'value1');
  assert.equal(cache.get('key1'), 'value1');
  assert.equal(cache.has('key1'), true);
  assert.equal(cache.has('non-existent'), false);
});

test('MemoryCache expires items past TTL', async () => {
  const cache = new MemoryCache();
  cache.set('short-lived', 42, 20); // 20ms TTL
  assert.equal(cache.get('short-lived'), 42);

  await new Promise((r) => setTimeout(r, 35));
  assert.equal(cache.get('short-lived'), undefined);
  assert.equal(cache.has('short-lived'), false);
});

test('MemoryCache enforces maxSize with LRU eviction', () => {
  const cache = new MemoryCache({ maxSize: 2, evictionPolicy: 'lru' });
  cache.set('a', 1);
  cache.set('b', 2);
  // Access 'a' so 'b' becomes least recently used
  cache.get('a');

  cache.set('c', 3);
  assert.equal(cache.get('b'), undefined); // 'b' evicted
  assert.equal(cache.get('a'), 1);
  assert.equal(cache.get('c'), 3);
});

test('MemoryCache delete and clear functions properly', () => {
  const cache = new MemoryCache();
  cache.set('k1', 'v1');
  cache.set('k2', 'v2');
  assert.equal(cache.size(), 2);

  assert.equal(cache.delete('k1'), true);
  assert.equal(cache.get('k1'), undefined);
  assert.equal(cache.size(), 1);

  cache.clear();
  assert.equal(cache.size(), 0);
});

test('withCache returns cached value without executing factory again', async () => {
  const cache = new MemoryCache();
  let callCount = 0;
  const fetcher = async () => {
    callCount++;
    return 'data-from-db';
  };

  const res1 = await withCache(fetcher, { cache, key: 'user:123' });
  assert.equal(res1, 'data-from-db');
  assert.equal(callCount, 1);

  const res2 = await withCache(fetcher, { cache, key: 'user:123' });
  assert.equal(res2, 'data-from-db');
  assert.equal(callCount, 1); // Not called again!

  const res3 = await withCache(fetcher, { cache, key: 'user:123', forceRefresh: true });
  assert.equal(res3, 'data-from-db');
  assert.equal(callCount, 2); // Refreshed
});
