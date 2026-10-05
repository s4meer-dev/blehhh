import { CircuitBreaker } from './circuit-breaker.js';
import { retry, type RetryOptions } from './retry.js';

export interface ResilientClientOptions {
  /** Global request timeout in milliseconds (default: 5000) */
  timeoutMs?: number;
  /** Custom circuit breaker instance */
  circuitBreaker?: CircuitBreaker;
  /** Retry policy configurations */
  retry?: RetryOptions;
  /** Base URL for all relative requests */
  baseUrl?: string;
  /** Default headers applied to all requests */
  headers?: Record<string, string>;
}

export class ResilientClient {
  private readonly baseUrl?: string;
  private readonly timeoutMs: number;
  private readonly headers: Record<string, string>;
  private readonly circuitBreaker?: CircuitBreaker;
  private readonly retryOptions?: RetryOptions;

  constructor(options: ResilientClientOptions = {}) {
    this.baseUrl = options.baseUrl?.replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.headers = options.headers ?? {};
    this.circuitBreaker = options.circuitBreaker;
    this.retryOptions = options.retry;
  }

  public async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const targetUrl = this.resolveUrl(url);
    const combinedHeaders = { ...this.headers, ...(init.headers as Record<string, string>) };

    const executeRequest = async (): Promise<Response> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await globalThis.fetch(targetUrl, {
          ...init,
          headers: combinedHeaders,
          signal: init.signal ?? controller.signal,
        });

        // Consider 5xx server errors as transient failures for retry / breaker
        if (response.status >= 500) {
          throw new Error(`HTTP Error: Status ${response.status} ${response.statusText}`);
        }

        return response;
      } finally {
        clearTimeout(timeoutId);
      }
    };

    const runWithBreaker = async (): Promise<Response> => {
      if (this.circuitBreaker) {
        return this.circuitBreaker.execute(executeRequest);
      }
      return executeRequest();
    };

    if (this.retryOptions) {
      return retry(() => runWithBreaker(), this.retryOptions);
    }

    return runWithBreaker();
  }

  private resolveUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) {
      return path;
    }
    if (!this.baseUrl) {
      return path;
    }
    const cleanPath = path.replace(/^\//, '');
    return `${this.baseUrl}/${cleanPath}`;
  }
}
