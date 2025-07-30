/**
 * Browser HTTP-based service registry implementation
 */

import {
  IServiceRegistry,
  ServiceInfo,
  ServiceRegistry as ServiceRegistryType,
  RegisterOptions,
  DiscoverOptions,
  HealthCheckOptions,
  ServiceRegistryConfig,
  Environment,
  ServiceNotFoundError,
  RegistryUnavailableError,
  HealthCheckError,
} from '../types/index.js';

export class BrowserServiceRegistry implements IServiceRegistry {
  private config: ServiceRegistryConfig & {
    registryPath: string;
    registryApiUrl: string;
    healthCheckTimeout: number;
    retryAttempts: number;
    retryDelay: number;
    cleanupInterval: number;
    serviceTimeout: number;
  };
  private cache: Map<string, { data: ServiceRegistryType; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5000; // 5 seconds

  constructor(config: ServiceRegistryConfig = {}) {
    this.config = {
      registryPath: '', // Not used in browser
      registryApiUrl: 'http://localhost:3001/api/registry',
      healthCheckTimeout: 5000,
      retryAttempts: 3,
      retryDelay: 1000,
      cleanupInterval: 60000, // Not used in browser
      serviceTimeout: 300000, // Not used in browser
      firebaseConfig: undefined,
      useFirebase: false,
      ...config,
    };
  }

  /**
   * Configure the registry
   */
  configure(config: ServiceRegistryConfig): void {
    this.config = { ...this.config, ...config };
    
    // Clear cache when configuration changes
    this.cache.clear();
  }

  /**
   * Get current environment
   */
  getEnvironment(): Environment {
    return 'browser';
  }

  /**
   * Register a service with the registry
   * Note: In browser environment, registration is not supported
   * Services should register themselves via their Node.js processes
   */
  async register(name: string, options: RegisterOptions): Promise<void> {
    throw new RegistryUnavailableError(
      'Service registration is not supported in browser environment. Services should register themselves via their Node.js processes.',
      { name, options, environment: 'browser' }
    );
  }

  /**
   * Discover a service by name
   */
  async discover(name: string, options: DiscoverOptions = {}): Promise<ServiceInfo | null> {
    const { timeout = this.config.healthCheckTimeout, retries = this.config.retryAttempts, includeHealth = false } = options;

    let lastError: unknown = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const registry = await this.fetchRegistry();
        const service = registry.services[name];

        if (!service) {
          return null;
        }

        // Optionally include health check
        if (includeHealth && service.healthCheckUrl) {
          try {
            const isHealthy = await this.performHealthCheck(service.healthCheckUrl, { timeout });
            // Note: We don't update the registry in browser mode, just return the current health status
            return {
              ...service,
              isHealthy,
              lastHealthCheck: new Date().toISOString(),
            };
          } catch (healthError) {
            return {
              ...service,
              isHealthy: false,
              lastHealthCheck: new Date().toISOString(),
            };
          }
        }

        return service;
      } catch (error) {
        lastError = error;
        
        if (attempt < retries) {
          await this.delay(this.config.retryDelay);
        }
      }
    }

    if (lastError) {
      const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
      throw new RegistryUnavailableError(
        `Failed to discover service '${name}' after ${retries + 1} attempts: ${errorMessage}`,
        { error: lastError, name, options }
      );
    }

    return null;
  }

  /**
   * Unregister a service
   * Note: In browser environment, unregistration is not supported
   */
  async unregister(name: string): Promise<void> {
    throw new RegistryUnavailableError(
      'Service unregistration is not supported in browser environment. Services should unregister themselves via their Node.js processes.',
      { name, environment: 'browser' }
    );
  }

  /**
   * Check if a service is healthy
   */
  async checkHealth(name: string, options: HealthCheckOptions = {}): Promise<boolean> {
    const { timeout = this.config.healthCheckTimeout, retries = this.config.retryAttempts } = options;

    const service = await this.discover(name);
    
    if (!service) {
      throw new ServiceNotFoundError(name);
    }

    if (!service.healthCheckUrl) {
      // No health check URL, assume healthy if service exists
      return true;
    }

    let lastError: unknown = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.performHealthCheck(service.healthCheckUrl, { timeout });
      } catch (error) {
        lastError = error;
        
        if (attempt < retries) {
          await this.delay(this.config.retryDelay);
        }
      }
    }

    throw new HealthCheckError(name, { error: lastError, attempts: retries + 1 });
  }

  /**
   * List all registered services
   */
  async listServices(): Promise<ServiceInfo[]> {
    try {
      const registry = await this.fetchRegistry();
      return Object.values(registry.services);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new RegistryUnavailableError(
        `Failed to list services: ${errorMessage}`,
        { error }
      );
    }
  }

  /**
   * Clean up stale services
   * Note: In browser environment, cleanup is handled by the server
   */
  async cleanup(): Promise<void> {
    // Clear local cache to force fresh data on next request
    this.cache.clear();
  }

  // Private methods

  private async fetchRegistry(): Promise<ServiceRegistryType> {
    const cacheKey = this.config.registryApiUrl;
    const now = Date.now();
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && (now - cached.timestamp) < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.healthCheckTimeout);

      const response = await fetch(this.config.registryApiUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': '@firesite/service-registry-browser',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const registry: ServiceRegistryType = await response.json();
      
      // Cache the result
      this.cache.set(cacheKey, { data: registry, timestamp: now });
      
      return registry;
    } catch (error) {
      // Try to return cached data even if it's stale
      const cached = this.cache.get(cacheKey);
      if (cached) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn('Using stale registry data due to fetch error:', errorMessage);
        return cached.data;
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new RegistryUnavailableError(
        `Failed to fetch registry from ${this.config.registryApiUrl}: ${errorMessage}`,
        { error, url: this.config.registryApiUrl }
      );
    }
  }

  private async performHealthCheck(url: string, options: { timeout: number }): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': '@firesite/service-registry-browser',
        },
        mode: 'cors', // Enable CORS for cross-origin requests
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      // In browser, CORS errors are common and expected for some services
      if (error instanceof Error && error.name === 'TypeError' && error.message.includes('CORS')) {
        console.warn(`CORS error for health check ${url}, assuming service is running`);
        return true; // Assume healthy if CORS is the only issue
      }
      return false;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}