export interface LatencySummary {
  count: number;
  mean: number;
  p50: number;
  p90: number;
  p99: number;
  min: number;
  max: number;
}

export class ResilienceMetricsCollector {
  private readonly counters = new Map<string, number>();
  private readonly latencies = new Map<string, number[]>();

  incrementCounter(name: string, value = 1): void {
    const current = this.counters.get(name) ?? 0;
    this.counters.set(name, current + value);
  }

  getCounter(name: string): number {
    return this.counters.get(name) ?? 0;
  }

  recordLatency(name: string, durationMs: number): void {
    let list = this.latencies.get(name);
    if (!list) {
      list = [];
      this.latencies.set(name, list);
    }
    list.push(durationMs);
    // Keep bounded history (last 5000 observations)
    if (list.length > 5000) {
      list.shift();
    }
  }

  getLatencySummary(name: string): LatencySummary {
    const list = this.latencies.get(name);
    if (!list || list.length === 0) {
      return { count: 0, mean: 0, p50: 0, p90: 0, p99: 0, min: 0, max: 0 };
    }

    const sorted = [...list].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((acc, val) => acc + val, 0);

    const percentile = (p: number): number => {
      const idx = Math.min(count - 1, Math.floor((p / 100) * count));
      return sorted[idx] ?? 0;
    };

    return {
      count,
      mean: Math.round((sum / count) * 100) / 100,
      p50: percentile(50),
      p90: percentile(90),
      p99: percentile(99),
      min: sorted[0] ?? 0,
      max: sorted[count - 1] ?? 0,
    };
  }

  reset(): void {
    this.counters.clear();
    this.latencies.clear();
  }
}
