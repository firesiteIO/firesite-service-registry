/**
 * Type definitions for Firesite Service Registry
 */

/**
 * Service information stored in the registry
 */
export interface ServiceInfo {
  /** Unique service identifier */
  name: string;
  /** Port number the service is running on */
  port: number;
  /** Process ID (Node.js only) */
  pid?: number;
  /** Service status */
  status: 'running' | 'stopped' | 'error' | 'unknown';
  /** When the service was registered */
  startedAt: string;
  /** Health check endpoint path */
  healthUrl?: string | undefined;
  /** Complete health check URL */
  healthCheckUrl?: string | undefined;
  /** Additional service metadata */
  metadata?: Record<string, any>;
  /** Last health check timestamp */
  lastHealthCheck?: string;
  /** Last health check result */
  isHealthy?: boolean;
}

/**
 * Registry structure
 */
export interface ServiceRegistry {
  /** Map of service name to service info */
  services: Record<string, ServiceInfo>;
  /** When the registry was last updated */
  lastUpdated: string;
}

/**
 * Options for service registration
 */
export interface RegisterOptions {
  /** Port number the service is running on */
  port: number;
  /** Process ID (Node.js only) */
  pid?: number;
  /** Health check endpoint path */
  healthUrl?: string | undefined;
  /** Additional service metadata */
  metadata?: Record<string, any>;
  /** Custom health check function */
  healthCheck?: () => Promise<boolean>;
}

/**
 * Options for service discovery
 */
export interface DiscoverOptions {
  /** Timeout for discovery operation in ms */
  timeout?: number;
  /** Number of retry attempts */
  retries?: number;
  /** Include health check in discovery */
  includeHealth?: boolean;
}

/**
 * Options for health checks
 */
export interface HealthCheckOptions {
  /** Timeout for health check in ms */
  timeout?: number;
  /** Number of retry attempts */
  retries?: number;
  /** Retry delay in ms */
  retryDelay?: number;
}

/**
 * Configuration options for the service registry
 */
export interface ServiceRegistryConfig {
  /** Custom registry file path (Node.js only) */
  registryPath?: string;
  /** Registry API endpoint URL (browser only) */
  registryApiUrl?: string;
  /** Default health check timeout in ms */
  healthCheckTimeout?: number;
  /** Default number of retry attempts */
  retryAttempts?: number;
  /** Default retry delay in ms */
  retryDelay?: number;
  /** Auto-cleanup interval in ms */
  cleanupInterval?: number;
  /** Service timeout before considered stale in ms */
  serviceTimeout?: number;
  /** Firebase configuration for real-time registry */
  firebaseConfig?: any;
  /** Use Firebase Realtime Database for registry */
  useFirebase?: boolean;
}

/**
 * Environment type
 */
export type Environment = 'node' | 'browser';

/**
 * Service registry implementation interface
 */
export interface IServiceRegistry {
  /**
   * Configure the registry
   */
  configure(config: ServiceRegistryConfig): void;

  /**
   * Register a service
   */
  register(name: string, options: RegisterOptions): Promise<void>;

  /**
   * Discover a service by name
   */
  discover(name: string, options?: DiscoverOptions): Promise<ServiceInfo | null>;

  /**
   * Unregister a service
   */
  unregister(name: string): Promise<void>;

  /**
   * Check if a service is healthy
   */
  checkHealth(name: string, options?: HealthCheckOptions): Promise<boolean>;

  /**
   * List all registered services
   */
  listServices(): Promise<ServiceInfo[]>;

  /**
   * Get current environment
   */
  getEnvironment(): Environment;

  /**
   * Clean up stale services
   */
  cleanup(): Promise<void>;
}

/**
 * Registry error types
 */
export class ServiceRegistryError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ServiceRegistryError';
  }
}

export class ServiceNotFoundError extends ServiceRegistryError {
  constructor(serviceName: string) {
    super(`Service '${serviceName}' not found in registry`, 'SERVICE_NOT_FOUND', { serviceName });
  }
}

export class RegistryUnavailableError extends ServiceRegistryError {
  constructor(message: string, details?: any) {
    super(message, 'REGISTRY_UNAVAILABLE', details);
  }
}

export class HealthCheckError extends ServiceRegistryError {
  constructor(serviceName: string, details?: any) {
    super(`Health check failed for service '${serviceName}'`, 'HEALTH_CHECK_FAILED', { serviceName, ...details });
  }
}