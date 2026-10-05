<div align="center">

# blehh ⚡

**Ultra-lightweight, zero-dependency resilience and fault-tolerance toolkit for TypeScript & Node.js.**

[![CI](https://github.com/s4meer-dev/blehhh/actions/workflows/ci.yml/badge.svg)](https://github.com/s4meer-dev/blehhh/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-green.svg)](https://github.com/s4meer-dev/blehhh)

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#api-reference">API Reference</a> •
  <a href="#contributing">Contributing</a>
</p>

</div>

---

## Features

- 🔄 **Exponential Backoff & Retry**: Sophisticated retry logic with **Full Jitter**, **Equal Jitter**, and **Decorrelated Jitter** to eliminate thundering herds.
- ⚡ **Circuit Breaker Pattern**: High-performance finite state machine (`CLOSED` ↔ `OPEN` ↔ `HALF_OPEN`) with probe concurrency regulation.
- ⏱️ **Rate Limiting**: Flexible traffic shaping using **Token Bucket** (burst-tolerant) and **Sliding Window Log** algorithms.
- 🌐 **Resilient HTTP Client**: Wrapper around `globalThis.fetch` combining automated retries, circuit breaking, and timeout abort controllers.
- 📝 **Structured JSON Observability**: High-throughput logger with context binding, log levels, and automatic recursive credential redaction.
- 🩺 **Health Check Registry**: Microservice readiness and liveness probe runner with critical vs non-critical subsystem discrimination.
- 🛑 **Graceful Teardown Coordinator**: Deterministic shutdown hook manager with watchdog timer protection for containerized workloads.
- 📦 **Zero Runtime Dependencies**: Pure TypeScript compiled for modern Node.js and ESM/CJS runtimes.

---

## Installation

```bash
npm install blehh
```

---

## Quick Start

### 1. Unified Resilience Suite

Bootstrap all resilience mechanisms for a microservice in seconds:

```typescript
import { createResilienceSuite } from 'blehh';

const suite = createResilienceSuite({
  serviceName: 'payment-gateway',
  circuitBreaker: {
    failureThreshold: 3,
    recoveryTimeoutMs: 15000,
  },
  client: {
    baseUrl: 'https://api.payments.internal',
    timeoutMs: 3000,
    retry: {
      maxRetries: 3,
      jitter: 'full',
    },
  },
});

// Resilient API Call
try {
  const response = await suite.client.fetch('/v1/charges', {
    method: 'POST',
    body: JSON.stringify({ amount: 5000, currency: 'usd' }),
  });
  const data = await response.json();
  suite.logger.info('Payment processed successfully', { transactionId: data.id });
} catch (err) {
  suite.logger.error('Payment transaction failed', err);
}
```

---

## Architecture & Primitives

### Exponential Backoff with Jitter

```typescript
import { retry } from 'blehh';

const result = await retry(
  async (attempt) => {
    return await queryRemoteDatabase();
  },
  {
    maxRetries: 4,
    baseDelayMs: 250,
    maxDelayMs: 5000,
    jitter: 'full', // 'none' | 'full' | 'equal' | 'decorrelated'
    onRetry: (err, attempt, delayMs) => {
      console.warn(`Retry attempt #${attempt} scheduled in ${delayMs}ms due to: ${err}`);
    },
  }
);
```

### Circuit Breaker

```typescript
import { CircuitBreaker } from 'blehh';

const breaker = new CircuitBreaker({
  failureThreshold: 5,
  recoveryTimeoutMs: 10000,
  halfOpenConcurrencyLimit: 1,
  fallback: () => ({ status: 'FALLBACK_CACHED_PAYLOAD' }),
});

breaker.on('stateChange', ({ from, to }) => {
  console.log(`Circuit Breaker transitioned: ${from} -> ${to}`);
});

const data = await breaker.execute(async () => {
  return await fetchSensitiveResource();
});
```

### Rate Limiting

```typescript
import { TokenBucketRateLimiter, SlidingWindowRateLimiter } from 'blehh';

// Token Bucket: allows up to 10 tokens, refilling 2 tokens every second
const limiter = new TokenBucketRateLimiter({
  capacity: 10,
  refillRate: 2,
  refillIntervalMs: 1000,
});

if (limiter.tryConsume(1)) {
  // Execute request
} else {
  // Return HTTP 429 Too Many Requests
}
```

### Health & Liveness Probes

```typescript
import { HealthRegistry } from 'blehh';

const health = new HealthRegistry();

health.register({
  name: 'database',
  critical: true,
  check: async () => {
    const isUp = await db.ping();
    return { status: isUp ? 'UP' : 'DOWN' };
  },
});

const report = await health.getReport();
console.log(report.status); // 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY'
```

---

## Development & Testing

```bash
# Clone the repository
git clone https://github.com/s4meer-dev/blehhh.git
cd blehhh

# Install dependencies
npm install

# Run type checker
npm run lint

# Compile distribution
npm run build

# Run automated test suite
npm test
```

---

## Community & Contributing

We welcome community contributions! Please review our guidelines before participating:
- [Contributing Guide](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md)

---

## License

This project is licensed under the [MIT License](LICENSE).
Created and maintained by [Sameer (s4meer-dev)](https://github.com/s4meer-dev).
