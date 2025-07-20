/**
 * Unified ServiceRegistry class with automatic environment detection
 */

import {
  IServiceRegistry,
  ServiceInfo,
  RegisterOptions,
  DiscoverOptions,
  HealthCheckOptions,
  ServiceRegistryConfig,
  Environment,
} from '../types/index.js';
import { NodeServiceRegistry } from '../node/node-registry.js';
import { BrowserServiceRegistry } from '../browser/browser-registry.js';

export class ServiceRegistry implements IServiceRegistry {
  private implementation: IServiceRegistry;
  private environment: Environment;

  constructor(config: ServiceRegistryConfig = {}) {
    this.environment = this.detectEnvironment();
    this.implementation = this.createImplementation(config);
  }

  /**
   * Static factory method for creating a ServiceRegistry instance
   */
  static create(config: ServiceRegistryConfig = {}): ServiceRegistry {
    return new ServiceRegistry(config);
  }

  /**
   * Configure the registry
   */
  configure(config: ServiceRegistryConfig): void {
    this.implementation.configure(config);
  }

  /**
   * Get current environment
   */
  getEnvironment(): Environment {
    return this.environment;
  }

  /**
   * Register a service with the registry
   */
  async register(name: string, options: RegisterOptions): Promise<void> {
    return this.implementation.register(name, options);
  }

  /**
   * Discover a service by name
   */
  async discover(name: string, options?: DiscoverOptions): Promise<ServiceInfo | null> {
    return this.implementation.discover(name, options);
  }

  /**
   * Unregister a service
   */
  async unregister(name: string): Promise<void> {
    return this.implementation.unregister(name);
  }

  /**
   * Check if a service is healthy
   */
  async checkHealth(name: string, options?: HealthCheckOptions): Promise<boolean> {
    return this.implementation.checkHealth(name, options);
  }

  /**
   * List all registered services
   */
  async listServices(): Promise<ServiceInfo[]> {
    return this.implementation.listServices();
  }

  /**
   * Clean up stale services
   */
  async cleanup(): Promise<void> {
    return this.implementation.cleanup();
  }

  /**
   * Dispose of the registry
   */
  dispose(): void {
    if ('dispose' in this.implementation && typeof this.implementation.dispose === 'function') {
      this.implementation.dispose();
    }
  }

  // Private methods

  private detectEnvironment(): Environment {
    // Check if we're in a Node.js environment
    if (typeof process !== 'undefined' && 
        process.versions != null && 
        process.versions.node != null) {
      return 'node';
    }

    // Check if we're in a browser environment
    if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
      return 'browser';
    }

    // Check for other browser-like environments (Web Workers, Service Workers)
    if (typeof self !== 'undefined' && typeof (self as any).importScripts !== 'function') {
      return 'browser';
    }

    // Default to browser if detection is unclear
    return 'browser';
  }

  private createImplementation(config: ServiceRegistryConfig): IServiceRegistry {
    if (this.environment === 'node') {
      // Dynamic import for Node.js implementation
      return this.createNodeImplementation(config);
    } else {
      // Dynamic import for browser implementation
      return this.createBrowserImplementation(config);
    }
  }

  private createNodeImplementation(config: ServiceRegistryConfig): IServiceRegistry {
    return new NodeServiceRegistry(config);
  }

  private createBrowserImplementation(config: ServiceRegistryConfig): IServiceRegistry {
    return new BrowserServiceRegistry(config);
  }
}

// Static methods for convenience
export namespace ServiceRegistry {
  /**
   * Register a service (convenience method)
   */
  export async function register(name: string, options: RegisterOptions, config?: ServiceRegistryConfig): Promise<void> {
    const registry = new ServiceRegistry(config);
    return registry.register(name, options);
  }

  /**
   * Discover a service (convenience method)
   */
  export async function discover(name: string, options?: DiscoverOptions, config?: ServiceRegistryConfig): Promise<ServiceInfo | null> {
    const registry = new ServiceRegistry(config);
    return registry.discover(name, options);
  }

  /**
   * Check service health (convenience method)
   */
  export async function checkHealth(name: string, options?: HealthCheckOptions, config?: ServiceRegistryConfig): Promise<boolean> {
    const registry = new ServiceRegistry(config);
    return registry.checkHealth(name, options);
  }

  /**
   * List all services (convenience method)
   */
  export async function listServices(config?: ServiceRegistryConfig): Promise<ServiceInfo[]> {
    const registry = new ServiceRegistry(config);
    return registry.listServices();
  }

  /**
   * Unregister a service (convenience method)
   */
  export async function unregister(name: string, config?: ServiceRegistryConfig): Promise<void> {
    const registry = new ServiceRegistry(config);
    return registry.unregister(name);
  }

  /**
   * Get current environment (convenience method)
   */
  export function getEnvironment(): Environment {
    const registry = new ServiceRegistry();
    return registry.getEnvironment();
  }
}

// Default export for CommonJS compatibility
export default ServiceRegistry;