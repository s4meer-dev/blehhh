/**
 * blehh - Performance & Latency Benchmark Engine
 */

export interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTimeMs: number;
  opsPerSecond: number;
  avgLatencyUs: number;
}

export async function benchmark(
  name: string,
  fn: () => Promise<void> | void,
  iterations = 10000
): Promise<BenchmarkResult> {
  // Warmup phase
  for (let i = 0; i < Math.min(100, iterations); i++) {
    await fn();
  }

  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    await fn();
  }

  const end = performance.now();
  const totalTimeMs = end - start;
  const opsPerSecond = Math.floor((iterations / totalTimeMs) * 1000);
  const avgLatencyUs = (totalTimeMs / iterations) * 1000;

  return {
    name,
    iterations,
    totalTimeMs: Math.round(totalTimeMs * 100) / 100,
    opsPerSecond,
    avgLatencyUs: Math.round(avgLatencyUs * 100) / 100,
  };
}
