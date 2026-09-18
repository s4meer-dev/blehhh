# Advanced Resilience Patterns in blehh ⚡

This guide describes the core latency mitigation and fault-tolerance patterns implemented in `blehh`.

## 1. In-Memory Cache & Cache-Aside (`withCache`)

Caching is the first line of defense against downstream strain. `MemoryCache` supports configurable TTL and LRU/FIFO eviction:

```typescript
import { MemoryCache, withCache } from 'blehh';

const userCache = new MemoryCache<string, UserProfile>({
  maxSize: 5000,
  defaultTtlMs: 60_000, // 1 minute TTL
  evictionPolicy: 'lru',
});

// Cache-aside wrapper
const profile = await withCache(
  () => fetchUserProfileFromDatabase(userId),
  { cache: userCache, key: userId }
);
```

## 2. Speculative Hedged Requests (`hedgedRequest`)

When downstream tail latencies spike (e.g. p99 stalls), hedged requests issue a speculative backup attempt if the primary hasn't responded within a delay budget:

```typescript
import { hedgedRequest } from 'blehh';

const response = await hedgedRequest(
  async (signal, attempt) => {
    return await fetch('https://api.upstream.internal/compute', { signal });
  },
  {
    delayMs: 150, // Launch hedge if primary takes > 150ms
    maxHedges: 1,  // Maximum 1 speculative backup
  }
);
```

Whichever finishes first resolves the call; remaining active requests receive an immediate cancellation abort signal.

## 3. Distributed Deadlines & Budget Propagation (`DeadlineContext`)

Track remaining execution budgets through multi-step pipelines:

```typescript
import { DeadlineContext } from 'blehh';

// Total budget for entire operation is 1000ms
const ctx = new DeadlineContext(1000);

await ctx.run(async (signal) => {
  // Pass signal to downstream fetch calls
  await stepOne({ signal });
  
  // Create child context with capped deadline
  const childCtx = ctx.createChild(300);
  await childCtx.run(async (childSignal) => {
    await stepTwo({ signal: childSignal });
  });
});
```
