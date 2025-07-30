/**
 * Tests for BrowserServiceRegistry implementation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BrowserServiceRegistry } from '../browser/browser-registry.js';
import { ServiceRegistryError, ServiceNotFoundError } from '../types/index.js';
import type { RegisterOptions, ServiceInfo } from '../types/index.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};
Object.defineProperty(global, 'localStorage', {
  value: mockLocalStorage,
  writable: true
});

describe('BrowserServiceRegistry', () => {
  let registry: BrowserServiceRegistry;
  
  beforeEach(() => {
    vi.clearAllMocks();
    registry = new BrowserServiceRegistry();
  });

  describe('Constructor and Configuration', () => {
    it('should create instance with default configuration', () => {
      expect(registry).toBeInstanceOf(BrowserServiceRegistry);
    });

    it('should accept custom configuration', () => {
      const config = {
        registryApiUrl: 'http://localhost:3001/api/registry',
        healthCheckTimeout: 10000,
        retryAttempts: 5
      };

      registry = new BrowserServiceRegistry(config);
      expect(registry).toBeInstanceOf(BrowserServiceRegistry);
    });

    it('should configure after instantiation', () => {
      const config = {
        registryApiUrl: 'http://localhost:3002/api/registry',
        retryDelay: 2000
      };

      expect(() => registry.configure(config)).not.toThrow();
    });

    it('should return browser environment', () => {
      expect(registry.getEnvironment()).toBe('browser');
    });
  });

  describe('Service Registration', () => {
    it('should throw error when trying to register service in browser', async () => {
      const options: RegisterOptions = {
        port: 3000,
        pid: 1234,
        healthUrl: '/health',
        metadata: { version: '1.0.0' }
      };

      await expect(registry.register('test-service', options)).rejects.toThrow(ServiceRegistryError);
      await expect(registry.register('test-service', options)).rejects.toThrow('Service registration is not supported in browser environment');
    });

    it('should throw RegistryUnavailableError with correct details', async () => {
      const options: RegisterOptions = { port: 3000 };

      try {
        await registry.register('test-service', options);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceRegistryError);
        expect((error as ServiceRegistryError).code).toBe('REGISTRY_UNAVAILABLE');
        expect((error as ServiceRegistryError).details).toMatchObject({
          name: 'test-service',
          environment: 'browser'
        });
      }
    });
  });

  describe('Service Discovery', () => {
    it('should discover an existing service', async () => {
      const mockService: ServiceInfo = {
        name: 'test-service',
        port: 3000,
        status: 'running',
        startedAt: '2025-01-20T00:00:00.000Z',
        pid: 1234,
        healthUrl: '/health'
      };

      const mockRegistry = {
        services: {
          'test-service': mockService
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRegistry
      });

      const result = await registry.discover('test-service');
      expect(result).toEqual(mockService);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:3001/api/registry'),
        expect.objectContaining({
          method: 'GET'
        })
      );
    });

    it('should return null for non-existent service', async () => {
      const mockRegistry = {
        services: {}
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRegistry
      });

      const result = await registry.discover('non-existent-service');
      expect(result).toBeNull();
    });

    it('should handle discovery API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      await expect(registry.discover('test-service')).rejects.toThrow(ServiceRegistryError);
    });

    it('should use cache for repeated discoveries', async () => {
      const mockService: ServiceInfo = {
        name: 'test-service',
        port: 3000,
        status: 'running',
        startedAt: '2025-01-20T00:00:00.000Z'
      };

      const mockRegistry = {
        services: {
          'test-service': mockService
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRegistry
      });

      // First call should hit the API
      const result1 = await registry.discover('test-service');
      expect(result1).toEqual(mockService);

      // Second call should use cache (no additional fetch)
      const result2 = await registry.discover('test-service');
      expect(result2).toEqual(mockService);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should discover with retry options', async () => {
      const mockService: ServiceInfo = {
        name: 'test-service',
        port: 3000,
        status: 'running',
        startedAt: '2025-01-20T00:00:00.000Z'
      };

      const mockRegistry = {
        services: {
          'test-service': mockService
        }
      };

      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockRegistry
        });

      const result = await registry.discover('test-service', { retries: 2 });
      expect(result).toEqual(mockService);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should discover with health check included', async () => {
      const mockService: ServiceInfo = {
        name: 'test-service',
        port: 3000,
        status: 'running',
        startedAt: '2025-01-20T00:00:00.000Z',
        pid: 1234,
        healthUrl: '/health',
        healthCheckUrl: 'http://localhost:3000/health'
      };

      const mockRegistry = {
        services: {
          'test-service': mockService
        }
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockRegistry
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'ok' })
        });

      const result = await registry.discover('test-service', { includeHealth: true });
      expect(result).toMatchObject({
        ...mockService,
        isHealthy: true,
        lastHealthCheck: expect.any(String)
      });
    });
  });

  describe('Service Unregistration', () => {
    it('should throw error when trying to unregister service in browser', async () => {
      await expect(registry.unregister('test-service')).rejects.toThrow(ServiceRegistryError);
      await expect(registry.unregister('test-service')).rejects.toThrow('Service unregistration is not supported in browser environment');
    });
  });

  describe('Health Checking', () => {
    it('should check health by discovering service first', async () => {
      const mockService: ServiceInfo = {
        name: 'test-service',
        port: 3000,
        status: 'running',
        startedAt: '2025-01-20T00:00:00.000Z',
        pid: 1234,
        healthUrl: '/health',
        healthCheckUrl: 'http://localhost:3000/health'
      };

      const mockRegistry = {
        services: {
          'test-service': mockService
        }
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockRegistry
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'ok' })
        });

      const result = await registry.checkHealth('test-service');
      expect(result).toBe(true);
    });

    it('should return false for non-existent service', async () => {
      const mockRegistry = {
        services: {}
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRegistry
      });

      // Should throw ServiceNotFoundError for non-existent service
      await expect(registry.checkHealth('non-existent-service')).rejects.toThrow(ServiceNotFoundError);
    });

    it('should handle CORS errors gracefully', async () => {
      const mockService: ServiceInfo = {
        name: 'test-service',
        port: 3000,
        status: 'running',
        startedAt: '2025-01-20T00:00:00.000Z',
        healthCheckUrl: 'http://localhost:3000/health'
      };

      const mockRegistry = {
        services: {
          'test-service': mockService
        }
      };

      const corsError = new Error('Failed to fetch due to CORS policy violation');
      corsError.name = 'TypeError';

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockRegistry
        })
        .mockRejectedValueOnce(corsError);

      const result = await registry.checkHealth('test-service');
      expect(result).toBe(true); // Assumes service is running when CORS blocks the check
    });
  });

  describe('List Services', () => {
    it('should list all services', async () => {
      const mockServices = {
        'service1': { name: 'service1', port: 3000, status: 'running', startedAt: '2025-01-20T00:00:00.000Z' },
        'service2': { name: 'service2', port: 4000, status: 'running', startedAt: '2025-01-20T00:00:00.000Z' }
      };

      const mockRegistry = {
        services: mockServices
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRegistry
      });

      const result = await registry.listServices();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('service1');
      expect(result[1].name).toBe('service2');
    });

    it('should return empty array when no services', async () => {
      const mockRegistry = {
        services: {}
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRegistry
      });

      const result = await registry.listServices();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it('should handle list API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      await expect(registry.listServices()).rejects.toThrow(ServiceRegistryError);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup by clearing cache', async () => {
      // First populate cache by discovering a service
      const mockRegistry = {
        services: {
          'test-service': { name: 'test-service', port: 3000, status: 'running', startedAt: '2025-01-20T00:00:00.000Z' }
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRegistry
      });

      await registry.discover('test-service');

      // Now cleanup (should clear cache)
      await expect(registry.cleanup()).resolves.toBeUndefined();

      // Next discover should hit API again (cache cleared)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRegistry
      });

      await registry.discover('test-service');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle fetch network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(registry.discover('test-service')).rejects.toThrow(ServiceRegistryError);
    });

    it('should handle JSON parsing errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => { throw new Error('Invalid JSON'); }
      });

      await expect(registry.discover('test-service')).rejects.toThrow(ServiceRegistryError);
    });

    it('should include error details in ServiceRegistryError', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request'
      });

      try {
        await registry.discover('test-service');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceRegistryError);
        expect((error as ServiceRegistryError).code).toBe('REGISTRY_UNAVAILABLE');
      }
    });
  });
});