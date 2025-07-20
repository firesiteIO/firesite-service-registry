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

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockService
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

      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockService
        });

      const result = await registry.discover('test-service', { retryAttempts: 2, retryDelay: 100 });
      expect(result).toEqual(mockService);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Service Unregistration', () => {
    it('should unregister an existing service', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      await expect(registry.unregister('test-service')).resolves.toBeUndefined();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/registry/unregister/test-service'),
        expect.objectContaining({
          method: 'DELETE'
        })
      );
    });

    it('should throw error when unregistering non-existent service', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(registry.unregister('non-existent-service')).rejects.toThrow(ServiceNotFoundError);
    });

    it('should handle unregistration API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      await expect(registry.unregister('test-service')).rejects.toThrow(ServiceRegistryError);
    });

    it('should clear cache after unregistration', async () => {
      // First register and discover a service (to cache it)
      const mockService: ServiceInfo = {
        name: 'test-service',
        port: 3000,
        status: 'running',
        startedAt: '2025-01-20T00:00:00.000Z'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockService
      });

      await registry.discover('test-service');

      // Now unregister it
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      await registry.unregister('test-service');

      // Next discovery should hit the API again (cache cleared)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      const result = await registry.discover('test-service');
      expect(result).toBeNull();
    });
  });

  describe('Health Checking', () => {
    it('should return true for healthy service', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ healthy: true })
      });

      const result = await registry.checkHealth('test-service');
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/registry/health/test-service'),
        expect.objectContaining({
          method: 'GET'
        })
      );
    });

    it('should return false for unhealthy service', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ healthy: false })
      });

      const result = await registry.checkHealth('test-service');
      expect(result).toBe(false);
    });

    it('should return false for non-existent service', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      const result = await registry.checkHealth('non-existent-service');
      expect(result).toBe(false);
    });

    it('should handle CORS errors gracefully', async () => {
      const corsError = new Error('NetworkError: Failed to fetch');
      corsError.name = 'TypeError';
      mockFetch.mockRejectedValueOnce(corsError);

      const result = await registry.checkHealth('test-service');
      expect(result).toBe(true); // Assumes service is running when CORS blocks the check
    });

    it('should handle health check with timeout option', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ healthy: true })
      });

      const result = await registry.checkHealth('test-service', { timeout: 5000 });
      expect(result).toBe(true);
    });

    it('should direct health check when healthUrl is provided', async () => {
      // First discover the service to get health URL
      const mockService: ServiceInfo = {
        name: 'test-service',
        port: 3000,
        status: 'running',
        startedAt: '2025-01-20T00:00:00.000Z',
        healthUrl: '/health',
        healthCheckUrl: 'http://localhost:3000/health'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockService
      });

      await registry.discover('test-service');

      // Now check health - should use direct health URL
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' })
      });

      const result = await registry.checkHealth('test-service');
      expect(result).toBe(true);
    });
  });

  describe('List Services', () => {
    it('should list all services', async () => {
      const mockServices: ServiceInfo[] = [
        { name: 'service1', port: 3000, status: 'running', startedAt: '2025-01-20T00:00:00.000Z' },
        { name: 'service2', port: 4000, status: 'running', startedAt: '2025-01-20T00:00:00.000Z' }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockServices
      });

      const result = await registry.listServices();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('service1');
      expect(result[1].name).toBe('service2');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/registry/list'),
        expect.objectContaining({
          method: 'GET'
        })
      );
    });

    it('should return empty array when no services', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => []
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
    it('should cleanup stale services', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ cleaned: 2 })
      });

      await expect(registry.cleanup()).resolves.toBeUndefined();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/registry/cleanup'),
        expect.objectContaining({
          method: 'POST'
        })
      );
    });

    it('should handle cleanup API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      await expect(registry.cleanup()).rejects.toThrow(ServiceRegistryError);
    });
  });

  describe('Caching', () => {
    it('should cache discovered services', async () => {
      const mockService: ServiceInfo = {
        name: 'test-service',
        port: 3000,
        status: 'running',
        startedAt: '2025-01-20T00:00:00.000Z'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockService
      });

      // First discovery should cache the result
      const result1 = await registry.discover('test-service');
      expect(result1).toEqual(mockService);

      // Second discovery should use cache
      const result2 = await registry.discover('test-service');
      expect(result2).toEqual(mockService);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should invalidate cache after registration', async () => {
      // First discover a service
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'test-service', port: 3000, status: 'running', startedAt: '2025-01-20T00:00:00.000Z' })
      });

      await registry.discover('test-service');

      // Register a service (should clear cache)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      await registry.register('new-service', { port: 4000 });

      // Next discovery should hit the API again
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'test-service', port: 3000, status: 'running', startedAt: '2025-01-20T00:00:00.000Z' })
      });

      await registry.discover('test-service');
      expect(mockFetch).toHaveBeenCalledTimes(3); // discover + register + discover
    });
  });

  describe('Error Handling', () => {
    it('should handle fetch network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(registry.register('test-service', { port: 3000 })).rejects.toThrow(ServiceRegistryError);
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
        await registry.register('test-service', { port: 3000 });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceRegistryError);
        expect((error as ServiceRegistryError).code).toBe('API_ERROR');
        expect((error as ServiceRegistryError).details).toMatchObject({
          status: 400,
          statusText: 'Bad Request'
        });
      }
    });
  });
});