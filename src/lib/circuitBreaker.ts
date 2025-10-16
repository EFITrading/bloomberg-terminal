// Circuit Breaker pattern implementation for API resilience
// Prevents cascading failures when external services are down

interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeoutMs: number;
  monitoringTimeWindowMs: number;
}

enum CircuitBreakerState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Failing fast, not calling the service
  HALF_OPEN = 'HALF_OPEN' // Testing if service is back up
}

interface CircuitBreakerStats {
  failures: number;
  successes: number;
  lastFailureTime: number;
  state: CircuitBreakerState;
  nextAttemptTime: number;
}

export class CircuitBreaker {
  private stats: CircuitBreakerStats;
  private config: CircuitBreakerConfig;
  private serviceName: string;

  constructor(
    serviceName: string, 
    config: Partial<CircuitBreakerConfig> = {}
  ) {
    this.serviceName = serviceName;
    this.config = {
      failureThreshold: config.failureThreshold || 5,
      recoveryTimeoutMs: config.recoveryTimeoutMs || 60000, // 1 minute
      monitoringTimeWindowMs: config.monitoringTimeWindowMs || 300000, // 5 minutes
      ...config
    };

    this.stats = {
      failures: 0,
      successes: 0,
      lastFailureTime: 0,
      state: CircuitBreakerState.CLOSED,
      nextAttemptTime: 0
    };
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit breaker should open
    this.checkState();

    // If circuit is open, fail fast
    if (this.stats.state === CircuitBreakerState.OPEN) {
      const timeUntilRetry = Math.max(0, this.stats.nextAttemptTime - Date.now());
      throw new Error(
        `Circuit breaker is OPEN for ${this.serviceName}. ` +
        `Retry in ${Math.ceil(timeUntilRetry / 1000)}s. ` +
        `Failures: ${this.stats.failures}/${this.config.failureThreshold}`
      );
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.stats.successes++;
    
    // If we were in HALF_OPEN state and succeeded, close the circuit
    if (this.stats.state === CircuitBreakerState.HALF_OPEN) {
      console.log(`✅ Circuit breaker CLOSED for ${this.serviceName} - service recovered`);
      this.stats.state = CircuitBreakerState.CLOSED;
      this.stats.failures = 0;
    }
  }

  private onFailure(): void {
    this.stats.failures++;
    this.stats.lastFailureTime = Date.now();

    console.warn(
      `⚠️ Circuit breaker failure ${this.stats.failures}/${this.config.failureThreshold} ` +
      `for ${this.serviceName}`
    );

    // Open circuit if threshold exceeded
    if (this.stats.failures >= this.config.failureThreshold) {
      this.openCircuit();
    }
  }

  private openCircuit(): void {
    this.stats.state = CircuitBreakerState.OPEN;
    this.stats.nextAttemptTime = Date.now() + this.config.recoveryTimeoutMs;
    
    console.error(
      `🔴 Circuit breaker OPENED for ${this.serviceName} ` +
      `after ${this.stats.failures} failures. ` +
      `Will retry at ${new Date(this.stats.nextAttemptTime).toLocaleTimeString()}`
    );
  }

  private checkState(): void {
    const now = Date.now();

    // Reset failure count if outside monitoring window
    if (now - this.stats.lastFailureTime > this.config.monitoringTimeWindowMs) {
      this.stats.failures = 0;
    }

    // Transition from OPEN to HALF_OPEN when recovery timeout expires
    if (
      this.stats.state === CircuitBreakerState.OPEN && 
      now >= this.stats.nextAttemptTime
    ) {
      console.log(`🟡 Circuit breaker HALF_OPEN for ${this.serviceName} - testing recovery`);
      this.stats.state = CircuitBreakerState.HALF_OPEN;
    }
  }

  // Get current status for monitoring
  getStatus() {
    return {
      serviceName: this.serviceName,
      state: this.stats.state,
      failures: this.stats.failures,
      successes: this.stats.successes,
      failureThreshold: this.config.failureThreshold,
      lastFailureTime: this.stats.lastFailureTime ? new Date(this.stats.lastFailureTime).toISOString() : null,
      nextAttemptTime: this.stats.nextAttemptTime ? new Date(this.stats.nextAttemptTime).toISOString() : null
    };
  }

  // Reset circuit breaker (for testing or manual recovery)
  reset(): void {
    console.log(`🔄 Manually resetting circuit breaker for ${this.serviceName}`);
    this.stats = {
      failures: 0,
      successes: 0,
      lastFailureTime: 0,
      state: CircuitBreakerState.CLOSED,
      nextAttemptTime: 0
    };
  }
}

// Global circuit breakers for common services
export const circuitBreakers = {
  polygon: new CircuitBreaker('Polygon API', {
    failureThreshold: 3,
    recoveryTimeoutMs: 30000, // 30 seconds
    monitoringTimeWindowMs: 120000 // 2 minutes
  }),
  
  historicalData: new CircuitBreaker('Historical Data API', {
    failureThreshold: 5,
    recoveryTimeoutMs: 60000, // 1 minute
    monitoringTimeWindowMs: 300000 // 5 minutes
  }),
  
  optionsFlow: new CircuitBreaker('Options Flow API', {
    failureThreshold: 4,
    recoveryTimeoutMs: 45000, // 45 seconds
    monitoringTimeWindowMs: 180000 // 3 minutes
  })
};

// Utility function to wrap API calls with circuit breaker
export async function withCircuitBreaker<T>(
  breakerName: keyof typeof circuitBreakers,
  operation: () => Promise<T>
): Promise<T> {
  return circuitBreakers[breakerName].execute(operation);
}

// Get status of all circuit breakers for monitoring
export function getCircuitBreakerStatus() {
  return Object.entries(circuitBreakers).map(([name, breaker]) => ({
    name,
    ...breaker.getStatus()
  }));
}