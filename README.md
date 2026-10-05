# blehh ⚡

> Modern, ultra-lightweight resilience & fault-tolerance toolkit for TypeScript and Node.js.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue.svg)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## Overview

`blehh` provides zero-dependency, type-safe primitives for engineering resilient distributed systems:

- **Circuit Breaker**: Three-state pattern (Closed, Open, Half-Open) with configurable failure thresholds and decay windows.
- **Exponential Backoff & Retry**: Sophisticated retry logic featuring Full Jitter, Equal Jitter, and custom retry filters.
- **Rate Limiter**: Token Bucket and Sliding Window algorithms with burst capacity controls.
- **Structured Observability**: High-throughput JSON event logger with redaction and context tracing.
- **Health Probes**: Extensible liveness and readiness monitoring suite for Kubernetes / cloud deployments.

---

## Quick Start

```bash
npm install blehh
```

Full documentation and examples are coming up in subsequent releases.
