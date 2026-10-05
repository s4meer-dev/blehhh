/**
 * blehh ⚡
 * Ultra-lightweight resilience & fault-tolerance toolkit for TypeScript and Node.js.
 */

export const VERSION = '1.0.0';

export interface ResilienceConfig {
  serviceName: string;
  debug?: boolean;
}

export function createResilienceSuite(config: ResilienceConfig) {
  return {
    serviceName: config.serviceName,
    initializedAt: new Date().toISOString(),
    status: 'ACTIVE' as const,
  };
}
