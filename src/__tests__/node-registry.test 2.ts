/**
 * Tests for NodeServiceRegistry implementation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { NodeServiceRegistry } from '../node/node-registry.js';
import { ServiceRegistryError, ServiceNotFoundError } from '../types/index.js';
import type { RegisterOptions, ServiceInfo } from '../types/index.js';

// Mock fs and process
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    access: vi.fn(),
    unlink: vi.fn()
  }
}));

vi.mock('path', () => ({
  dirname: vi.fn().mockReturnValue('/mock/dir'),
  join: vi.fn().mockReturnValue('/mock/path/registry.json')
}));

vi.mock('os', () => ({
  tmpdir: vi.fn().mockReturnValue('/tmp'),
  homedir: vi.fn().mockReturnValue('/home/user')
}));

describe('NodeServiceRegistry', () => {
  let registry: NodeServiceRegistry;
  const mockFs = fs as any;
  
  beforeEach(() => {
    vi.clearAllMocks();
    registry = new NodeServiceRegistry();
  });

  afterEach(() => {
    if (registry && typeof registry.dispose === 'function') {
      registry.dispose();
    }
  });

  describe('Constructor and Configuration', () => {
    it('should create instance with default configuration', () => {
      expect(registry).toBeInstanceOf(NodeServiceRegistry);
    });

    it('should accept custom configuration', () => {
      const config = {
        registryPath: '/custom/path/registry.json',
        healthCheckTimeout: 10000,
        retryAttempts: 5
      };

      registry = new NodeServiceRegistry(config);
      expect(registry).toBeInstanceOf(NodeServiceRegistry);
    });

    it('should configure after instantiation', () => {
      const config = {
        registryPath: '/new/path/registry.json',
        cleanupInterval: 120000
      };

      expect(() => registry.configure(config)).not.toThrow();
    });
  });

  describe('Service Registration', () => {
    it('should register a service successfully', async () => {
      // Mock successful file operations
      mockFs.access.mockRejectedValue(new Error('File not found'));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readFile.mockRejectedValue(new Error('File not found'));
      mockFs.writeFile.mockResolvedValue(undefined);

      const options: RegisterOptions = {
        port: 3000,
        pid: 1234,
        healthUrl: '/health',
        metadata: { version: '1.0.0' }
      };

      await expect(registry.register('test-service', options)).resolves.toBeUndefined();
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should register service with minimal options', async () => {
      mockFs.access.mockRejectedValue(new Error('File not found'));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readFile.mockRejectedValue(new Error('File not found'));
      mockFs.writeFile.mockResolvedValue(undefined);

      const options: RegisterOptions = {
        port: 3000
      };

      await expect(registry.register('minimal-service', options)).resolves.toBeUndefined();
    });

    it('should handle existing registry file', async () => {
      const existingRegistry = {
        'existing-service': {
          name: 'existing-service',
          port: 4000,
          status: 'running',
          startedAt: '2025-01-20T00:00:00.000Z'
        }
      };

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(existingRegistry));
      mockFs.writeFile.mockResolvedValue(undefined);

      const options: RegisterOptions = { port: 3000 };
      await expect(registry.register('new-service', options)).resolves.toBeUndefined();
    });

    it('should handle file system errors during registration', async () => {
      mockFs.access.mockRejectedValue(new Error('File not found'));
      mockFs.mkdir.mockRejectedValue(new Error('Permission denied'));

      const options: RegisterOptions = { port: 3000 };
      await expect(registry.register('test-service', options)).rejects.toThrow(ServiceRegistryError);
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

      const registry = { 'test-service': mockService };
      mockFs.readFile.mockResolvedValue(JSON.stringify(registry));

      const result = await registry.discover('test-service');
      expect(result).toEqual(mockService);
    });

    it('should return null for non-existent service', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify({}));

      const result = await registry.discover('non-existent-service');
      expect(result).toBeNull();
    });

    it('should handle file not found error', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT: no such file'));

      const result = await registry.discover('test-service');
      expect(result).toBeNull();
    });

    it('should handle invalid JSON in registry file', async () => {
      mockFs.readFile.mockResolvedValue('invalid json');

      await expect(registry.discover('test-service')).rejects.toThrow(ServiceRegistryError);
    });

    it('should discover with retry options', async () => {
      mockFs.readFile.mockResolvedValueOnce('invalid json')
                     .mockResolvedValueOnce(JSON.stringify({ 'test-service': { name: 'test-service', port: 3000, status: 'running', startedAt: '2025-01-20T00:00:00.000Z' } }));

      const result = await registry.discover('test-service', { retryAttempts: 2, retryDelay: 100 });
      expect(result).toBeTruthy();
    });
  });

  describe('Service Unregistration', () => {
    it('should unregister an existing service', async () => {
      const mockRegistry = {
        'test-service': { name: 'test-service', port: 3000, status: 'running', startedAt: '2025-01-20T00:00:00.000Z' },
        'other-service': { name: 'other-service', port: 4000, status: 'running', startedAt: '2025-01-20T00:00:00.000Z' }
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(mockRegistry));
      mockFs.writeFile.mockResolvedValue(undefined);

      await expect(registry.unregister('test-service')).resolves.toBeUndefined();
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should throw error when unregistering non-existent service', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify({}));

      await expect(registry.unregister('non-existent-service')).rejects.toThrow(ServiceNotFoundError);
    });

    it('should handle file system errors during unregistration', async () => {
      mockFs.readFile.mockRejectedValue(new Error('Permission denied'));

      await expect(registry.unregister('test-service')).rejects.toThrow(ServiceRegistryError);
    });
  });

  describe('Health Checking', () => {
    it('should return true for healthy service with valid PID', async () => {
      const mockService = {
        name: 'test-service',
        port: 3000,
        status: 'running',
        startedAt: '2025-01-20T00:00:00.000Z',
        pid: process.pid, // Use current process PID
        healthUrl: '/health'
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify({ 'test-service': mockService }));

      const result = await registry.checkHealth('test-service');
      expect(result).toBe(true);
    });

    it('should return false for service with invalid PID', async () => {
      const mockService = {
        name: 'test-service',
        port: 3000,
        status: 'running',
        startedAt: '2025-01-20T00:00:00.000Z',
        pid: 99999, // Non-existent PID
        healthUrl: '/health'
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify({ 'test-service': mockService }));

      const result = await registry.checkHealth('test-service');
      expect(result).toBe(false);
    });

    it('should return false for non-existent service', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify({}));

      const result = await registry.checkHealth('non-existent-service');
      expect(result).toBe(false);
    });

    it('should handle health check with timeout option', async () => {
      const mockService = {
        name: 'test-service',
        port: 3000,
        status: 'running',
        startedAt: '2025-01-20T00:00:00.000Z',
        pid: process.pid
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify({ 'test-service': mockService }));

      const result = await registry.checkHealth('test-service', { timeout: 5000 });
      expect(result).toBe(true);
    });
  });

  describe('List Services', () => {
    it('should list all services', async () => {
      const mockRegistry = {
        'service1': { name: 'service1', port: 3000, status: 'running', startedAt: '2025-01-20T00:00:00.000Z' },
        'service2': { name: 'service2', port: 4000, status: 'running', startedAt: '2025-01-20T00:00:00.000Z' }
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(mockRegistry));

      const result = await registry.listServices();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('service1');
      expect(result[1].name).toBe('service2');
    });

    it('should return empty array when no services', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify({}));

      const result = await registry.listServices();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it('should handle file not found error', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT: no such file'));

      const result = await registry.listServices();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup stale services', async () => {
      const mockRegistry = {
        'running-service': { 
          name: 'running-service', 
          port: 3000, 
          status: 'running', 
          startedAt: '2025-01-20T00:00:00.000Z',
          pid: process.pid
        },
        'stale-service': { 
          name: 'stale-service', 
          port: 4000, 
          status: 'running', 
          startedAt: '2025-01-20T00:00:00.000Z',
          pid: 99999 // Non-existent PID
        }
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(mockRegistry));
      mockFs.writeFile.mockResolvedValue(undefined);

      await expect(registry.cleanup()).resolves.toBeUndefined();
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should handle cleanup with no stale services', async () => {
      const mockRegistry = {
        'running-service': { 
          name: 'running-service', 
          port: 3000, 
          status: 'running', 
          startedAt: '2025-01-20T00:00:00.000Z',
          pid: process.pid
        }
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(mockRegistry));

      await expect(registry.cleanup()).resolves.toBeUndefined();
    });

    it('should handle cleanup with empty registry', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT: no such file'));

      await expect(registry.cleanup()).resolves.toBeUndefined();
    });
  });

  describe('Disposal and Cleanup Intervals', () => {
    it('should dispose without errors', () => {
      expect(() => registry.dispose()).not.toThrow();
    });

    it('should handle cleanup interval', () => {
      const registryWithInterval = new NodeServiceRegistry({ cleanupInterval: 1000 });
      expect(() => registryWithInterval.dispose()).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should throw ServiceRegistryError for file system errors', async () => {
      mockFs.readFile.mockRejectedValue(new Error('Permission denied'));

      await expect(registry.register('test-service', { port: 3000 })).rejects.toThrow(ServiceRegistryError);
    });

    it('should handle JSON parsing errors', async () => {
      mockFs.readFile.mockResolvedValue('{ invalid json }');

      await expect(registry.discover('test-service')).rejects.toThrow(ServiceRegistryError);
    });

    it('should handle process kill errors gracefully', async () => {
      const mockService = {
        name: 'test-service',
        port: 3000,
        status: 'running',
        startedAt: '2025-01-20T00:00:00.000Z',
        pid: 1 // System process that can't be killed
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify({ 'test-service': mockService }));

      // Should not throw, just return false
      const result = await registry.checkHealth('test-service');
      expect(typeof result).toBe('boolean');
    });
  });
});