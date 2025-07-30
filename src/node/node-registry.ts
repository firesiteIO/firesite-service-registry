/**
 * Node.js file-based service registry implementation
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import {
  IServiceRegistry,
  ServiceInfo,
  ServiceRegistry,
  RegisterOptions,
  DiscoverOptions,
  HealthCheckOptions,
  ServiceRegistryConfig,
  Environment,
  ServiceNotFoundError,
  RegistryUnavailableError,
  HealthCheckError,
} from '../types/index.js';

export class NodeServiceRegistry implements IServiceRegistry {
  private config: ServiceRegistryConfig & {
    registryPath: string;
    registryApiUrl: string;
    healthCheckTimeout: number;
    retryAttempts: number;
    retryDelay: number;
    cleanupInterval: number;
    serviceTimeout: number;
  };
  private cleanupTimer?: NodeJS.Timeout | undefined;

  constructor(config: ServiceRegistryConfig = {}) {
    this.config = {
      registryPath: join(homedir(), '.firesite', 'registry.json'),
      registryApiUrl: '', // Not used in Node.js
      healthCheckTimeout: 5000,
      retryAttempts: 3,
      retryDelay: 1000,
      cleanupInterval: 60000, // 1 minute
      serviceTimeout: 300000, // 5 minutes
      firebaseConfig: undefined,
      useFirebase: false,
      ...config,
    };

    // Start periodic cleanup
    this.startCleanup();
  }

  /**
   * Configure the registry
   */
  configure(config: ServiceRegistryConfig): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current environment
   */
  getEnvironment(): Environment {
    return 'node';
  }

  /**
   * Register a service with the registry
   */
  async register(name: string, options: RegisterOptions): Promise<void> {
    try {
      await this.ensureRegistryDir();
      
      const registry = await this.loadRegistry();
      const now = new Date().toISOString();
      
      const serviceInfo: ServiceInfo = {
        name,
        port: options.port,
        pid: options.pid || process.pid,
        status: 'running',
        startedAt: now,
        healthUrl: options.healthUrl,
        healthCheckUrl: options.healthUrl ? `http://localhost:${options.port}${options.healthUrl}` : undefined,
        metadata: options.metadata || {},
        lastHealthCheck: now,
        isHealthy: true,
      };

      registry.services[name] = serviceInfo;
      registry.lastUpdated = now;

      await this.saveRegistry(registry);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new RegistryUnavailableError(
        `Failed to register service '${name}': ${errorMessage}`,
        { error, name, options }
      );
    }
  }

  /**
   * Discover a service by name
   */
  async discover(name: string, options: DiscoverOptions = {}): Promise<ServiceInfo | null> {
    const { timeout = this.config.healthCheckTimeout, retries = this.config.retryAttempts, includeHealth = false } = options;

    let lastError: unknown = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const registry = await this.loadRegistry();
        const service = registry.services[name];

        if (!service) {
          return null;
        }

        // Optionally include health check
        if (includeHealth && service.healthCheckUrl) {
          try {
            const isHealthy = await this.performHealthCheck(service.healthCheckUrl, { timeout });
            service.isHealthy = isHealthy;
            service.lastHealthCheck = new Date().toISOString();
            
            // Update registry with health info
            await this.saveRegistry(registry);
          } catch (healthError) {
            service.isHealthy = false;
            service.lastHealthCheck = new Date().toISOString();
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
   */
  async unregister(name: string): Promise<void> {
    try {
      const registry = await this.loadRegistry();
      
      if (!registry.services[name]) {
        throw new ServiceNotFoundError(name);
      }

      delete registry.services[name];
      registry.lastUpdated = new Date().toISOString();

      await this.saveRegistry(registry);
    } catch (error) {
      if (error instanceof ServiceNotFoundError) {
        throw error;
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new RegistryUnavailableError(
        `Failed to unregister service '${name}': ${errorMessage}`,
        { error, name }
      );
    }
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
        const isHealthy = await this.performHealthCheck(service.healthCheckUrl, { timeout });
        
        // Update registry with health info
        const registry = await this.loadRegistry();
        if (registry.services[name]) {
          registry.services[name].isHealthy = isHealthy;
          registry.services[name].lastHealthCheck = new Date().toISOString();
          await this.saveRegistry(registry);
        }

        return isHealthy;
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
      const registry = await this.loadRegistry();
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
   */
  async cleanup(): Promise<void> {
    try {
      const registry = await this.loadRegistry();
      const now = Date.now();
      const serviceTimeout = this.config.serviceTimeout;
      let hasChanges = false;

      for (const [name, service] of Object.entries(registry.services)) {
        const serviceAge = now - new Date(service.startedAt).getTime();
        
        // Check if service is stale
        if (serviceAge > serviceTimeout) {
          // Try to check if process is still running (Node.js specific)
          if (service.pid) {
            try {
              process.kill(service.pid, 0); // Signal 0 just checks if process exists
            } catch (error) {
              // Process doesn't exist, remove from registry
              delete registry.services[name];
              hasChanges = true;
              continue;
            }
          }

          // If service has health check, verify it's still responding
          if (service.healthCheckUrl) {
            try {
              const isHealthy = await this.performHealthCheck(service.healthCheckUrl, { timeout: 2000 });
              if (!isHealthy) {
                delete registry.services[name];
                hasChanges = true;
              }
            } catch (error) {
              delete registry.services[name];
              hasChanges = true;
            }
          }
        }
      }

      if (hasChanges) {
        registry.lastUpdated = new Date().toISOString();
        await this.saveRegistry(registry);
      }
    } catch (error) {
      // Silent fail for cleanup - don't throw errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`Registry cleanup failed: ${errorMessage}`);
    }
  }

  /**
   * Dispose of the registry (stop cleanup timer)
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  // Private methods

  private async ensureRegistryDir(): Promise<void> {
    const registryDir = this.config.registryPath.substring(0, this.config.registryPath.lastIndexOf('/'));
    
    try {
      await fs.access(registryDir);
    } catch (error) {
      await fs.mkdir(registryDir, { recursive: true });
    }
  }

  private async loadRegistry(): Promise<ServiceRegistry> {
    try {
      const data = await fs.readFile(this.config.registryPath, 'utf8');
      return JSON.parse(data);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Registry file doesn't exist, return empty registry
        return {
          services: {},
          lastUpdated: new Date().toISOString(),
        };
      }
      throw error;
    }
  }

  private async saveRegistry(registry: ServiceRegistry): Promise<void> {
    await fs.writeFile(this.config.registryPath, JSON.stringify(registry, null, 2), 'utf8');
  }

  private async performHealthCheck(url: string, options: { timeout: number }): Promise<boolean> {
    try {
      // Use dynamic import for fetch to support both Node.js versions
      const fetch = await this.getFetch();
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': '@firesite/service-registry',
        },
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  private async getFetch(): Promise<typeof fetch> {
    if (typeof globalThis.fetch !== 'undefined') {
      return globalThis.fetch;
    }

    // For Node.js versions that don't have fetch built-in
    try {
      const { default: fetch } = await import('node-fetch');
      return fetch as any;
    } catch (error) {
      throw new Error('fetch is not available. Please install node-fetch or use Node.js 18+');
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch(error => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn('Registry cleanup error:', errorMessage);
      });
    }, this.config.cleanupInterval);
  }
}