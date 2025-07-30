/**
 * Simple tests for ServiceRegistry core functionality
 * This focuses on environment detection and instantiation without deep mocking
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ServiceRegistry } from '../core/service-registry.js';

describe('ServiceRegistry - Simple Tests', () => {
  
  // Mock environment detection
  const originalProcess = global.process;
  const originalWindow = global.window;

  afterEach(() => {
    // Restore original environment
    global.process = originalProcess;
    global.window = originalWindow;
    vi.clearAllMocks();
  });

  describe('Environment Detection', () => {
    it('should detect Node.js environment correctly', () => {
      // Ensure we're in Node.js environment
      global.process = { versions: { node: '18.0.0' } } as any;
      delete (global as any).window;

      const registry = new ServiceRegistry();
      expect(registry.getEnvironment()).toBe('node');
    });

    it('should detect browser environment correctly', () => {
      // Mock browser environment
      delete (global as any).process;
      global.window = { document: {} } as any;

      const registry = new ServiceRegistry();
      expect(registry.getEnvironment()).toBe('browser');
    });

    it('should default to browser for unknown environments', () => {
      // Remove both process and window
      delete (global as any).process;
      delete (global as any).window;

      const registry = new ServiceRegistry();
      expect(registry.getEnvironment()).toBe('browser');
    });

    it('should detect web worker environment as browser', () => {
      delete (global as any).process;
      delete (global as any).window;
      global.self = {} as any;

      const registry = new ServiceRegistry();
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
      const registry = new ServiceRegistry();
      expect(registry).toBeInstanceOf(ServiceRegistry);
      expect(registry.getEnvironment()).toBe('node');
    });

    it('should create instance with ServiceRegistry.create()', () => {
      const registry = ServiceRegistry.create();
      expect(registry).toBeInstanceOf(ServiceRegistry);
      expect(registry.getEnvironment()).toBe('node');
    });

    it('should accept configuration in constructor', () => {
      const config = {
        registryPath: '/custom/path/registry.json',
        healthCheckTimeout: 10000
      };

      const registry = new ServiceRegistry(config);
      expect(registry).toBeInstanceOf(ServiceRegistry);
    });

    it('should accept configuration in factory method', () => {
      const config = {
        registryApiUrl: 'http://localhost:3001/api/registry',
        retryAttempts: 5
      };

      const registry = ServiceRegistry.create(config);
      expect(registry).toBeInstanceOf(ServiceRegistry);
    });
  });

  describe('Static Convenience Methods', () => {
    beforeEach(() => {
      global.process = { versions: { node: '18.0.0' } } as any;
      delete (global as any).window;
    });

    it('should provide static getEnvironment method', () => {
      const env = ServiceRegistry.getEnvironment();
      expect(env).toBeDefined();
      expect(['node', 'browser']).toContain(env);
    });
  });

  describe('Basic Method Existence', () => {
    let registry: ServiceRegistry;

    beforeEach(() => {
      global.process = { versions: { node: '18.0.0' } } as any;
      delete (global as any).window;
      registry = new ServiceRegistry();
    });

    it('should have all required methods', () => {
      expect(typeof registry.register).toBe('function');
      expect(typeof registry.discover).toBe('function');
      expect(typeof registry.unregister).toBe('function');
      expect(typeof registry.checkHealth).toBe('function');
      expect(typeof registry.listServices).toBe('function');
      expect(typeof registry.cleanup).toBe('function');
      expect(typeof registry.configure).toBe('function');
      expect(typeof registry.dispose).toBe('function');
      expect(typeof registry.getEnvironment).toBe('function');
    });

    it('should have static convenience methods', () => {
      expect(typeof ServiceRegistry.register).toBe('function');
      expect(typeof ServiceRegistry.discover).toBe('function');
      expect(typeof ServiceRegistry.checkHealth).toBe('function');
      expect(typeof ServiceRegistry.listServices).toBe('function');
      expect(typeof ServiceRegistry.unregister).toBe('function');
      expect(typeof ServiceRegistry.getEnvironment).toBe('function');
    });

    it('should dispose without errors', () => {
      expect(() => registry.dispose()).not.toThrow();
    });
  });
});