/**
 * Tests for ServiceRegistry core functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ServiceRegistry } from '../core/service-registry.js';
import type { ServiceRegistryConfig, RegisterOptions, ServiceInfo } from '../types/index.js';

// Mock the implementations
const mockImplementation = {
  register: vi.fn().mockResolvedValue(undefined),
  discover: vi.fn().mockResolvedValue(null),
  unregister: vi.fn().mockResolvedValue(undefined),
  checkHealth: vi.fn().mockResolvedValue(true),
  listServices: vi.fn().mockResolvedValue([]),
  cleanup: vi.fn().mockResolvedValue(undefined),
  configure: vi.fn(),
  dispose: vi.fn()
};

vi.mock('../node/node-registry.js', () => {
  return { 
    NodeServiceRegistry: vi.fn().mockImplementation(() => mockImplementation)
  };
});

vi.mock('../browser/browser-registry.js', () => {
  return { 
    BrowserServiceRegistry: vi.fn().mockImplementation(() => mockImplementation)
  };
});

describe('ServiceRegistry', () => {
  let registry: ServiceRegistry;
  
  // Mock environment detection
  const originalProcess = global.process;
  const originalWindow = global.window;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original environment
    global.process = originalProcess;
    global.window = originalWindow;
  });

  describe('Environment Detection', () => {
    it('should detect Node.js environment correctly', () => {
      // Ensure we're in Node.js environment
      global.process = { versions: { node: '18.0.0' } } as any;
      delete (global as any).window;

      registry = new ServiceRegistry();
      expect(registry.getEnvironment()).toBe('node');
    });

    it('should detect browser environment correctly', () => {
      // Mock browser environment
      delete (global as any).process;
      global.window = { document: {} } as any;

      registry = new ServiceRegistry();
      expect(registry.getEnvironment()).toBe('browser');
    });

    it('should default to browser for unknown environments', () => {
      // Remove both process and window
      delete (global as any).process;
      delete (global as any).window;

      registry = new ServiceRegistry();
      expect(registry.getEnvironment()).toBe('browser');
    });

    it('should detect web worker environment as browser', () => {
      delete (global as any).process;
      delete (global as any).window;
      global.self = {} as any;

      registry = new ServiceRegistry();
      expect(registry.getEnvironment()).toBe('browser');
      
      delete (global as any).self;
    });
  });

  describe('Constructor and Factory Methods', () => {
    beforeEach(() => {
      global.process = { versions: { node: '18.0.0' } } as any;
      delete (global as any).window;
    });

    it('should create instance with new ServiceRegistry()', () => {
      registry = new ServiceRegistry();
      expect(registry).toBeInstanceOf(ServiceRegistry);
      expect(registry.getEnvironment()).toBe('node');
    });

    it('should create instance with ServiceRegistry.create()', () => {
      registry = ServiceRegistry.create();
      expect(registry).toBeInstanceOf(ServiceRegistry);
      expect(registry.getEnvironment()).toBe('node');
    });

    it('should accept configuration in constructor', () => {
      const config: ServiceRegistryConfig = {
        registryPath: '/custom/path/registry.json',
        healthCheckTimeout: 10000
      };

      registry = new ServiceRegistry(config);
      expect(registry).toBeInstanceOf(ServiceRegistry);
    });

    it('should accept configuration in factory method', () => {
      const config: ServiceRegistryConfig = {
        registryApiUrl: 'http://localhost:3001/api/registry',
        retryAttempts: 5
      };

      registry = ServiceRegistry.create(config);
      expect(registry).toBeInstanceOf(ServiceRegistry);
    });
  });

  describe('Core Methods', () => {
    beforeEach(() => {
      global.process = { versions: { node: '18.0.0' } } as any;
      delete (global as any).window;
      registry = new ServiceRegistry();
    });

    it('should register a service', async () => {
      const options: RegisterOptions = {
        port: 3000,
        pid: 1234,
        healthUrl: '/health'
      };

      await expect(registry.register('test-service', options)).resolves.toBeUndefined();
    });

    it('should discover a service', async () => {
      const result = await registry.discover('test-service');
      expect(result).toBeNull(); // Mock returns null
    });

    it('should discover a service with options', async () => {
      const result = await registry.discover('test-service', { retryAttempts: 3 });
      expect(result).toBeNull();
    });

    it('should unregister a service', async () => {
      await expect(registry.unregister('test-service')).resolves.toBeUndefined();
    });

    it('should check service health', async () => {
      const result = await registry.checkHealth('test-service');
      expect(result).toBe(true); // Mock returns true
    });

    it('should check service health with options', async () => {
      const result = await registry.checkHealth('test-service', { timeout: 5000 });
      expect(result).toBe(true);
    });

    it('should list all services', async () => {
      const result = await registry.listServices();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([]); // Mock returns empty array
    });

    it('should cleanup stale services', async () => {
      await expect(registry.cleanup()).resolves.toBeUndefined();
    });

    it('should configure the registry', () => {
      const config: ServiceRegistryConfig = {
        registryPath: '/new/path/registry.json'
      };

      expect(() => registry.configure(config)).not.toThrow();
    });

    it('should dispose of the registry', () => {
      expect(() => registry.dispose()).not.toThrow();
    });
  });

  describe('Static Convenience Methods', () => {
    beforeEach(() => {
      global.process = { versions: { node: '18.0.0' } } as any;
      delete (global as any).window;
    });

    it('should provide static register method', async () => {
      const options: RegisterOptions = { port: 3000 };
      await expect(ServiceRegistry.register('test-service', options)).resolves.toBeUndefined();
    });

    it('should provide static register method with config', async () => {
      const options: RegisterOptions = { port: 3000 };
      const config: ServiceRegistryConfig = { healthCheckTimeout: 5000 };
      await expect(ServiceRegistry.register('test-service', options, config)).resolves.toBeUndefined();
    });

    it('should provide static discover method', async () => {
      const result = await ServiceRegistry.discover('test-service');
      expect(result).toBeNull();
    });

    it('should provide static discover method with options and config', async () => {
      const result = await ServiceRegistry.discover(
        'test-service', 
        { retryAttempts: 3 }, 
        { healthCheckTimeout: 5000 }
      );
      expect(result).toBeNull();
    });

    it('should provide static checkHealth method', async () => {
      const result = await ServiceRegistry.checkHealth('test-service');
      expect(result).toBe(true);
    });

    it('should provide static checkHealth method with options and config', async () => {
      const result = await ServiceRegistry.checkHealth(
        'test-service',
        { timeout: 5000 },
        { retryAttempts: 3 }
      );
      expect(result).toBe(true);
    });

    it('should provide static listServices method', async () => {
      const result = await ServiceRegistry.listServices();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should provide static listServices method with config', async () => {
      const result = await ServiceRegistry.listServices({ healthCheckTimeout: 5000 });
      expect(Array.isArray(result)).toBe(true);
    });

    it('should provide static unregister method', async () => {
      await expect(ServiceRegistry.unregister('test-service')).resolves.toBeUndefined();
    });

    it('should provide static unregister method with config', async () => {
      await expect(ServiceRegistry.unregister('test-service', { retryAttempts: 3 })).resolves.toBeUndefined();
    });

    it('should provide static getEnvironment method', () => {
      const env = ServiceRegistry.getEnvironment();
      expect(['node', 'browser']).toContain(env);
    });
  });
});