/**
 * @firesite/service-registry
 * 
 * Centralized service registry for the Firesite ecosystem, enabling dynamic 
 * service discovery and port orchestration across all Firesite projects.
 */

// Core classes
export { ServiceRegistry } from './core/service-registry.js';

// Individual implementations (for advanced use cases)
export { NodeServiceRegistry } from './node/node-registry.js';
export { BrowserServiceRegistry } from './browser/browser-registry.js';

// Types and interfaces
export type {
  ServiceInfo,
  ServiceRegistry as ServiceRegistryType,
  RegisterOptions,
  DiscoverOptions,
  HealthCheckOptions,
  ServiceRegistryConfig,
  Environment,
  IServiceRegistry,
} from './types/index.js';

// Error classes
export {
  ServiceRegistryError,
  ServiceNotFoundError,
  RegistryUnavailableError,
  HealthCheckError,
} from './types/index.js';

// Default export (the main ServiceRegistry class)
export { ServiceRegistry as default } from './core/service-registry.js';

/**
 * Version information
 */
export const VERSION = '0.1.0';

/**
 * Package information
 */
export const PACKAGE_INFO = {
  name: '@firesite/service-registry',
  version: VERSION,
  description: 'Centralized service registry for the Firesite ecosystem',
  author: 'Firesite Team',
  license: 'MIT',
  repository: 'https://github.com/firesiteIO/firesite-service-registry',
} as const;