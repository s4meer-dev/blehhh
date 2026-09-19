import test from 'node:test';
import assert from 'node:assert/strict';
import { ResilienceMetricsCollector } from '../dist/metrics.js';

test('ResilienceMetricsCollector increments and returns counters', () => {
  const collector = new ResilienceMetricsCollector();
  assert.equal(collector.getCounter('requests_total'), 0);

  collector.incrementCounter('requests_total');
  collector.incrementCounter('requests_total', 4);
  assert.equal(collector.getCounter('requests_total'), 5);

  collector.reset();
  assert.equal(collector.getCounter('requests_total'), 0);
});

test('ResilienceMetricsCollector computes latency percentiles accurately', () => {
  const collector = new ResilienceMetricsCollector();
  for (let i = 1; i <= 100; i++) {
    collector.recordLatency('http_request_ms', i);
  }

  const summary = collector.getLatencySummary('http_request_ms');
  assert.equal(summary.count, 100);
  assert.equal(summary.min, 1);
  assert.equal(summary.max, 100);
  assert.equal(summary.mean, 50.5);
  assert.ok(summary.p50 >= 50 && summary.p50 <= 51);
  assert.ok(summary.p90 >= 90 && summary.p90 <= 91);
  assert.ok(summary.p99 >= 99 && summary.p99 <= 100);
});

test('ResilienceMetricsCollector returns zeros when no latencies recorded', () => {
  const collector = new ResilienceMetricsCollector();
  const summary = collector.getLatencySummary('empty');
  assert.equal(summary.count, 0);
  assert.equal(summary.mean, 0);
  assert.equal(summary.p99, 0);
});

test('ResilienceMetricsCollector serializes to Prometheus format', () => {
  const collector = new ResilienceMetricsCollector();
  collector.incrementCounter('circuit_breaker_trips', 3);
  collector.recordLatency('circuit_breaker_call', 45);

  const output = collector.toPrometheusFormat();
  assert.ok(output.includes('# TYPE circuit_breaker_trips counter'));
  assert.ok(output.includes('circuit_breaker_trips 3'));
  assert.ok(output.includes('# TYPE circuit_breaker_call_duration_ms summary'));
  assert.ok(output.includes('circuit_breaker_call_duration_ms{quantile="0.5"} 45'));
  assert.ok(output.includes('circuit_breaker_call_duration_ms_count 1'));
});
