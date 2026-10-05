/**
 * blehh - Structured JSON Logger with Sensitive Data Redaction
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerOptions {
  service?: string;
  minLevel?: LogLevel;
  redactKeys?: string[];
  outputFn?: (line: string) => void;
}

const LEVEL_WEIGHTS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const DEFAULT_REDACT_KEYS = [
  'password',
  'secret',
  'token',
  'authorization',
  'cookie',
  'apikey',
  'api_key',
  'creditcard',
];

export class Logger {
  private readonly service: string;
  private readonly minLevel: LogLevel;
  private readonly redactKeys: Set<string>;
  private readonly context: Record<string, unknown>;
  private readonly outputFn: (line: string) => void;

  constructor(options: LoggerOptions = {}, context: Record<string, unknown> = {}) {
    this.service = options.service ?? 'app';
    this.minLevel = options.minLevel ?? 'info';
    this.redactKeys = new Set(
      (options.redactKeys ?? DEFAULT_REDACT_KEYS).map((k) => k.toLowerCase())
    );
    this.context = context;
    this.outputFn = options.outputFn ?? console.log;
  }

  public child(childContext: Record<string, unknown>): Logger {
    return new Logger(
      {
        service: this.service,
        minLevel: this.minLevel,
        redactKeys: Array.from(this.redactKeys),
        outputFn: this.outputFn,
      },
      { ...this.context, ...childContext }
    );
  }

  public debug(message: string, meta?: Record<string, unknown>): void {
    this.write('debug', message, meta);
  }

  public info(message: string, meta?: Record<string, unknown>): void {
    this.write('info', message, meta);
  }

  public warn(message: string, meta?: Record<string, unknown>): void {
    this.write('warn', message, meta);
  }

  public error(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    const errorDetails = error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : error ? { raw: String(error) } : undefined;

    this.write('error', message, { ...meta, error: errorDetails });
  }

  private write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LEVEL_WEIGHTS[level] < LEVEL_WEIGHTS[this.minLevel]) {
      return;
    }

    const payload = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      service: this.service,
      message,
      ...this.redact(this.context),
      ...(meta ? this.redact(meta) : {}),
    };

    this.outputFn(JSON.stringify(payload));
  }

  private redact(obj: unknown): unknown {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.redact(item));
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (this.redactKeys.has(key.toLowerCase())) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.redact(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}
