/**
 * blehh - Composable Policy Pipeline
 * Ultra-lightweight resilience policy orchestration pattern.
 */

export type PolicyAction<T> = () => Promise<T> | T;

export interface IPolicy {
  readonly name?: string;
  execute<T>(action: PolicyAction<T>): Promise<T>;
}

export type PolicyFn = <T>(action: PolicyAction<T>) => Promise<T>;
export type PolicyStep = IPolicy | PolicyFn;

export interface PipelineMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  totalDurationMs: number;
  averageDurationMs: number;
}

export interface PipelineExecutionHooks {
  onBeforeExecute?: (context: { policyCount: number }) => void;
  onSuccess?: (context: { durationMs: number }) => void;
  onError?: (error: unknown, context: { durationMs: number }) => void;
}

/**
 * Orchestrates multiple resilience policies into a unified, sequential execution pipeline.
 * Policies are evaluated in declaration order (outermost to innermost wrapper).
 */
export class PolicyPipeline implements IPolicy {
  readonly name?: string;
  private readonly steps: { policy: PolicyStep; name?: string }[] = [];
  private totalExecutions = 0;
  private successfulExecutions = 0;
  private failedExecutions = 0;
  private totalDurationMs = 0;
  private hooks: PipelineExecutionHooks;

  constructor(options: { name?: string; hooks?: PipelineExecutionHooks } = {}) {
    this.name = options.name;
    this.hooks = options.hooks ?? {};
  }

  /**
   * Adds a policy or middleware function to the execution pipeline.
   */
  public use(policy: PolicyStep, name?: string): this {
    const policyName = name ?? (typeof policy === 'object' && policy.name ? policy.name : undefined);
    this.steps.push({ policy, name: policyName });
    return this;
  }

  /**
   * Alias for `use` to enable fluent pipe syntax.
   */
  public pipe(policy: PolicyStep, name?: string): this {
    return this.use(policy, name);
  }

  /**
   * Executes an asynchronous action wrapped by all registered policies in sequential order.
   */
  public async execute<T>(action: PolicyAction<T>): Promise<T> {
    this.totalExecutions++;
    const startTime = Date.now();

    if (this.hooks.onBeforeExecute) {
      this.hooks.onBeforeExecute({ policyCount: this.steps.length });
    }

    try {
      // Build wrapped execution chain from right (innermost) to left (outermost)
      let currentAction: () => Promise<T> = async () => action();

      for (let i = this.steps.length - 1; i >= 0; i--) {
        const item = this.steps[i];
        if (!item) continue;
        const step = item.policy;
        const next = currentAction;

        currentAction = async () => {
          if (typeof step === 'object' && 'execute' in step) {
            return step.execute(next);
          } else if (typeof step === 'function') {
            return step(next);
          } else {
            return next();
          }
        };
      }

      const result = await currentAction();
      const durationMs = Date.now() - startTime;
      this.successfulExecutions++;
      this.totalDurationMs += durationMs;

      if (this.hooks.onSuccess) {
        this.hooks.onSuccess({ durationMs });
      }

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.failedExecutions++;
      this.totalDurationMs += durationMs;

      if (this.hooks.onError) {
        this.hooks.onError(error, { durationMs });
      }

      throw error;
    }
  }

  /**
   * Returns the count of registered policies in this pipeline.
   */
  public getPolicyCount(): number {
    return this.steps.length;
  }

  /**
   * Returns the names of all registered policies.
   */
  public getPolicyNames(): string[] {
    return this.steps.map((s, index) => s.name ?? `Policy#${index + 1}`);
  }

  /**
   * Returns real-time execution metrics.
   */
  public getMetrics(): PipelineMetrics {
    const averageDurationMs =
      this.totalExecutions > 0 ? this.totalDurationMs / this.totalExecutions : 0;

    return {
      totalExecutions: this.totalExecutions,
      successfulExecutions: this.successfulExecutions,
      failedExecutions: this.failedExecutions,
      totalDurationMs: this.totalDurationMs,
      averageDurationMs: Math.round(averageDurationMs * 100) / 100,
    };
  }

  /**
   * Resets execution telemetry counters.
   */
  public resetMetrics(): void {
    this.totalExecutions = 0;
    this.successfulExecutions = 0;
    this.failedExecutions = 0;
    this.totalDurationMs = 0;
  }
}

/**
 * Creates and composes multiple policies into a unified PolicyPipeline.
 */
export function composePolicies(...policies: PolicyStep[]): PolicyPipeline {
  const pipeline = new PolicyPipeline();
  for (const policy of policies) {
    pipeline.use(policy);
  }
  return pipeline;
}
