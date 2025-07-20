/**
 * Tests for TypeScript types and interfaces
 */

import { describe, it, expect } from 'vitest';
import type { 
  ServiceInfo, 
  ServiceRegistry as ServiceRegistryType, 
  RegisterOptions, 
  DiscoverOptions, 
  HealthCheckOptions, 
  ServiceRegistryConfig,
  Environment 
} from '../types/index.js';

describe('TypeScript types', () => {
  describe('ServiceInfo interface', () => {
    it('should accept valid ServiceInfo object', () => {
      const serviceInfo: ServiceInfo = {
        name: 'test-service',
        port: 3000,
        pid: 1234,
        status: 'running',
        startedAt: '2025-01-20T00:00:00.000Z',
        healthUrl: '/health',
        healthCheckUrl: 'http://localhost:3000/health',
        metadata: { version: '1.0.0' },
        lastHealthCheck: '2025-01-20T00:00:00.000Z',
        isHealthy: true
      };

      expect(serviceInfo.name).toBe('test-service');
      expect(serviceInfo.port).toBe(3000);
      expect(serviceInfo.status).toBe('running');
    });

    it('should work with minimal ServiceInfo object', () => {
      const serviceInfo: ServiceInfo = {
        name: 'minimal-service',
        port: 4000,
        status: 'running',
        startedAt: '2025-01-20T00:00:00.000Z'
      };

      expect(serviceInfo.name).toBe('minimal-service');
      expect(serviceInfo.port).toBe(4000);
    });
  });

  describe('RegisterOptions interface', () => {
    it('should accept valid RegisterOptions object', () => {
      const options: RegisterOptions = {
        port: 3000,
        pid: 1234,
        healthUrl: '/health',
        metadata: { environment: 'development' }
      };

      expect(options.port).toBe(3000);
      expect(options.pid).toBe(1234);
    });

    it('should work with minimal RegisterOptions object', () => {
      const options: RegisterOptions = {
        port: 3000
      };

      expect(options.port).toBe(3000);
    });
  });

  describe('Environment type', () => {
    it('should accept valid environment values', () => {
      const nodeEnv: Environment = 'node';
      const browserEnv: Environment = 'browser';

      expect(nodeEnv).toBe('node');
      expect(browserEnv).toBe('browser');
    });
  });

  describe('ServiceRegistryConfig interface', () => {
    it('should accept valid config object', () => {
      const config: ServiceRegistryConfig = {
        registryPath: '/custom/path/registry.json',
        registryApiUrl: 'http://localhost:3001/api/registry',
        healthCheckTimeout: 10000,
        retryAttempts: 5,
        retryDelay: 2000,
        cleanupInterval: 120000,
        serviceTimeout: 600000
      };

      expect(config.registryPath).toBe('/custom/path/registry.json');
      expect(config.healthCheckTimeout).toBe(10000);
    });

    it('should work with empty config object', () => {
      const config: ServiceRegistryConfig = {};
      expect(typeof config).toBe('object');
    });
  });
});