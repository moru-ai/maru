import config from "../../../config";

export class BraintrustService {
  private isEnabled: boolean = false;

  constructor() {
    this.isEnabled =
      config.enableBraintrust &&
      !!config.braintrustApiKey &&
      !!config.braintrustProjectId;

    if (this.isEnabled) {
      console.log(
        "[BRAINTRUST] AI SDK observability enabled via OpenTelemetry"
      );
    } else {
      console.log(
        "[BRAINTRUST] Observability disabled - missing configuration or disabled in config"
      );
    }
  }

  /**
   * Get comprehensive telemetry configuration for AI SDK calls
   */
  getTelemetryConfig(metadata?: Record<string, any>) {
    if (!this.isEnabled) {
      return { isEnabled: false };
    }

    return {
      isEnabled: true,
      metadata: {
        service: "maru-agent",
        environment: config.nodeEnv,
        nodeVersion: process.version,
        timestamp: new Date().toISOString(),
        ...metadata,
      },
    };
  }

  /**
   * Check if Braintrust observability is enabled
   */
  get enabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Get function-specific telemetry config with operation details
   */
  getOperationTelemetry(operation: string, details?: Record<string, any>) {
    return this.getTelemetryConfig({
      operation,
      operationTimestamp: Date.now(),
      ...details,
    });
  }
}

// Singleton instance
export const braintrustService = new BraintrustService();
