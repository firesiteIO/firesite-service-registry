/**
 * Integration Tests
 * Tests the complete system including CLI integration and fallback mechanisms
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ServiceRegistry } from '../core/service-registry.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Mock the entire environment
vi.mock('os', () => ({
  homedir: vi.fn(() => '/mock/home'),
  hostname: vi.fn(() => 'test-host'),
  userInfo: vi.fn(() => ({ username: 'testuser' }))
}));

vi.mock('child_process', () => ({
  exec: vi.fn()
}));

describe('Integration Tests', () => {
  let mockFs: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();

    // Mock fs operations
    mockFs = {
      readFile: vi.fn(),
      writeFile: vi.fn(() => Promise.resolve()),
      mkdir: vi.fn(() => Promise.resolve()),
      access: vi.fn(() => Promise.resolve())
    };

    vi.doMock('fs', () => ({ promises: mockFs }));
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('Environment Detection and Fallback', () => {
    it('should use Firebase mode when enabled and available', async () => {
      process.env.FIRESITE_USE_FIREBASE = 'true';
      
      // Mock successful Firebase initialization
      const mockFirebase = {
        initializeApp: vi.fn(),
        getApps: vi.fn(() => []),
        database: vi.fn(() => ({
          ref: vi.fn(() => ({
            set: vi.fn(() => Promise.resolve()),
            child: vi.fn(() => ({
              set: vi.fn(() => Promise.resolve()),
              onDisconnect: vi.fn(() => ({
                remove: vi.fn(() => Promise.resolve())
              }))
            }))
          }))
        })),
        credential: { cert: vi.fn(() => ({})) }
      };

      vi.stubGlobal('eval', vi.fn((code) => {
        if (code.includes('firebase-admin')) {
          return Promise.resolve(mockFirebase);
        }
        return Promise.reject(new Error('Unknown import'));
      }));

      mockFs.readFile.mockImplementation((path: string) => {
        if (path.includes('user-id')) {
          return Promise.resolve('integration-test-user');
        }
        if (path.includes('config.json')) {
          return Promise.resolve(JSON.stringify({
            firebase: { projectId: 'firesitetest' }
          }));
        }
        return Promise.reject(new Error('File not found'));
      });

      const registry = new ServiceRegistry({ useFirebase: true });
      
      await registry.register('test-service', {
        port: 3000,
        pid: 12345,
        healthUrl: '/health'
      });

      expect(mockFirebase.initializeApp).toHaveBeenCalled();
      expect(mockFirebase.database).toHaveBeenCalled();
    });

    it('should fall back to file-based registry when Firebase fails', async () => {
      process.env.FIRESITE_USE_FIREBASE = 'true';
      
      // Mock Firebase failure
      vi.stubGlobal('eval', vi.fn(() => 
        Promise.reject(new Error('Firebase Admin SDK not available'))
      ));

      // Mock file system for fallback registry
      mockFs.readFile.mockImplementation((path: string) => {
        if (path.includes('registry.json')) {
          return Promise.resolve(JSON.stringify({ services: {}, lastUpdated: new Date().toISOString() }));
        }
        return Promise.reject(new Error('File not found'));
      });

      const registry = new ServiceRegistry({ useFirebase: true });
      
      // Should not throw, should use fallback
      await expect(
        registry.register('test-service', {
          port: 3000,
          pid: 12345,
          healthUrl: '/health'
        })
      ).resolves.not.toThrow();

      // Should have used file system
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should use file-based registry when Firebase mode disabled', async () => {
      delete process.env.FIRESITE_USE_FIREBASE;
      
      mockFs.readFile.mockImplementation((path: string) => {
        if (path.includes('registry.json')) {
          return Promise.resolve(JSON.stringify({ services: {}, lastUpdated: new Date().toISOString() }));
        }
        return Promise.reject(new Error('File not found'));
      });

      const registry = new ServiceRegistry();
      
      await registry.register('test-service', {
        port: 3000,
        pid: 12345,
        healthUrl: '/health'
      });

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('registry.json'),
        expect.any(String),
        'utf8'
      );
    });
  });

  describe('Cross-Environment User ID Consistency', () => {
    it('should maintain consistent user IDs across registry modes', async () => {
      const testUserId = 'consistent-user-123';
      
      // Set up file system to return consistent user ID
      mockFs.readFile.mockImplementation((path: string) => {
        if (path.includes('user-id')) {
          return Promise.resolve(testUserId);
        }
        if (path.includes('registry.json')) {
          return Promise.resolve(JSON.stringify({ services: {}, lastUpdated: new Date().toISOString() }));
        }
        return Promise.resolve('{}');
      });

      // Test file-based registry first
      const fileRegistry = new ServiceRegistry();
      await fileRegistry.register('test-service-file', {
        port: 3000,
        pid: 12345,
        healthUrl: '/health'
      });

      // Verify file registry used consistent user ID
      const fileWriteCall = mockFs.writeFile.mock.calls.find(call => 
        call[0].includes('registry.json')
      );
      const fileRegistryData = JSON.parse(fileWriteCall[1]);
      
      // Reset mocks for Firebase test
      vi.clearAllMocks();
      process.env.FIRESITE_USE_FIREBASE = 'true';
      
      // Mock Firebase
      const mockFirebase = {
        initializeApp: vi.fn(),
        getApps: vi.fn(() => []),
        database: vi.fn(() => ({
          ref: vi.fn(() => ({
            set: vi.fn(() => Promise.resolve()),
            child: vi.fn(() => ({
              set: vi.fn(() => Promise.resolve()),
              onDisconnect: vi.fn(() => ({
                remove: vi.fn(() => Promise.resolve())
              }))
            }))
          }))
        })),
        credential: { cert: vi.fn(() => ({})) }
      };

      vi.stubGlobal('eval', vi.fn(() => Promise.resolve(mockFirebase)));
      
      mockFs.readFile.mockImplementation((path: string) => {
        if (path.includes('user-id')) {
          return Promise.resolve(testUserId);
        }
        return Promise.resolve('{}');
      });

      // Test Firebase registry
      const firebaseRegistry = new ServiceRegistry({ useFirebase: true });
      await firebaseRegistry.register('test-service-firebase', {
        port: 3001,
        pid: 12346,
        healthUrl: '/health'
      });

      // Verify Firebase registry used same user ID
      const firebaseRef = mockFirebase.database().ref();
      const firebaseSetCall = firebaseRef.set.mock.calls[0];
      expect(firebaseSetCall[0].metadata.userId).toBe(testUserId);
    });
  });

  describe('Service Discovery Across Modes', () => {
    it('should discover services consistently in both modes', async () => {
      const serviceData = {
        name: 'consistent-service',
        port: 3000,
        pid: 12345,
        status: 'running',
        startedAt: '2023-01-01T00:00:00Z',
        healthUrl: '/health',
        metadata: { userId: 'test-user' }
      };

      // Test file-based discovery
      mockFs.readFile.mockImplementation((path: string) => {
        if (path.includes('registry.json')) {
          return Promise.resolve(JSON.stringify({
            services: { 'consistent-service': serviceData },
            lastUpdated: new Date().toISOString()
          }));
        }
        return Promise.resolve('{}');
      });

      const fileRegistry = new ServiceRegistry();
      const fileDiscovered = await fileRegistry.discover('consistent-service');
      
      expect(fileDiscovered).toEqual(serviceData);

      // Test Firebase discovery
      process.env.FIRESITE_USE_FIREBASE = 'true';
      
      const mockFirebase = {
        initializeApp: vi.fn(),
        getApps: vi.fn(() => []),
        database: vi.fn(() => ({
          ref: vi.fn(() => ({
            child: vi.fn(() => ({
              once: vi.fn(() => Promise.resolve({
                exists: () => true,
                val: () => serviceData,
                key: 'consistent-service'
              }))
            }))
          }))
        })),
        credential: { cert: vi.fn(() => ({})) }
      };

      vi.stubGlobal('eval', vi.fn(() => Promise.resolve(mockFirebase)));

      const firebaseRegistry = new ServiceRegistry({ useFirebase: true });
      const firebaseDiscovered = await firebaseRegistry.discover('consistent-service');
      
      expect(firebaseDiscovered).toEqual(serviceData);
    });
  });

  describe('Health Check Integration', () => {
    it('should perform health checks consistently across modes', async () => {
      const healthCheckUrl = 'http://localhost:3000/health';
      
      // Mock successful HTTP response
      vi.stubGlobal('fetch', vi.fn(() => 
        Promise.resolve({ ok: true } as Response)
      ));

      const serviceData = {
        name: 'health-test-service',
        port: 3000,
        pid: 12345,
        status: 'running',
        startedAt: '2023-01-01T00:00:00Z',
        healthUrl: '/health',
        healthCheckUrl,
        metadata: { userId: 'test-user' }
      };

      // Test file-based health check
      mockFs.readFile.mockImplementation((path: string) => {
        if (path.includes('registry.json')) {
          return Promise.resolve(JSON.stringify({
            services: { 'health-test-service': serviceData },
            lastUpdated: new Date().toISOString()
          }));
        }
        return Promise.resolve('{}');
      });

      const fileRegistry = new ServiceRegistry();
      const fileHealthy = await fileRegistry.checkHealth('health-test-service');
      
      expect(fileHealthy).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        healthCheckUrl,
        expect.objectContaining({
          method: 'GET',
          timeout: expect.any(Number)
        })
      );

      // Reset mocks for Firebase test
      vi.clearAllMocks();
      vi.stubGlobal('fetch', vi.fn(() => 
        Promise.resolve({ ok: true } as Response)
      ));

      // Test Firebase health check
      process.env.FIRESITE_USE_FIREBASE = 'true';
      
      const mockFirebase = {
        initializeApp: vi.fn(),
        getApps: vi.fn(() => []),
        database: vi.fn(() => ({
          ref: vi.fn(() => ({
            child: vi.fn(() => ({
              once: vi.fn(() => Promise.resolve({
                exists: () => true,
                val: () => serviceData,
                key: 'health-test-service'
              }))
            }))
          }))
        })),
        credential: { cert: vi.fn(() => ({})) }
      };

      vi.stubGlobal('eval', vi.fn(() => Promise.resolve(mockFirebase)));

      const firebaseRegistry = new ServiceRegistry({ useFirebase: true });
      const firebaseHealthy = await firebaseRegistry.checkHealth('health-test-service');
      
      expect(firebaseHealthy).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        healthCheckUrl,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'User-Agent': expect.stringContaining('service-registry')
          })
        })
      );
    });
  });

  describe('Configuration Management', () => {
    it('should load configuration from multiple sources with proper precedence', async () => {
      const globalConfig = {
        firebase: {
          projectId: 'global-project',
          databaseURL: 'https://global.firebaseio.com'
        },
        registry: {
          rtdbPath: 'global-path'
        }
      };

      const projectConfig = {
        firebase: {
          projectId: 'project-project',
          databaseURL: 'https://project.firebaseio.com'
        },
        registry: {
          rtdbPath: 'project-path'
        }
      };

      mockFs.readFile.mockImplementation((path: string) => {
        if (path.includes('.firesite/config.json')) {
          return Promise.resolve(JSON.stringify(globalConfig));
        }
        if (path.includes('.firesite-config.json')) {
          return Promise.resolve(JSON.stringify(projectConfig));
        }
        if (path.includes('user-id')) {
          return Promise.resolve('config-test-user');
        }
        return Promise.reject(new Error('File not found'));
      });

      process.env.FIRESITE_USE_FIREBASE = 'true';
      
      const mockFirebase = {
        initializeApp: vi.fn(),
        getApps: vi.fn(() => []),
        database: vi.fn(() => ({
          ref: vi.fn(() => ({
            set: vi.fn(() => Promise.resolve()),
            child: vi.fn(() => ({
              set: vi.fn(() => Promise.resolve()),
              onDisconnect: vi.fn(() => ({
                remove: vi.fn(() => Promise.resolve())
              }))
            }))
          }))
        })),
        credential: { cert: vi.fn(() => ({})) }
      };

      vi.stubGlobal('eval', vi.fn(() => Promise.resolve(mockFirebase)));

      const registry = new ServiceRegistry({ useFirebase: true });
      await registry.register('config-test-service', {
        port: 3000,
        pid: 12345,
        healthUrl: '/health'
      });

      // Should have read multiple config files
      expect(mockFs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('.firesite/config.json'),
        'utf8'
      );
      expect(mockFs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('.firesite-config.json'),
        'utf8'
      );

      // Should have used the first available config (project config in this case)
      expect(mockFirebase.database().ref).toHaveBeenCalledWith(
        'project-path/users/config-test-user/services'
      );
    });

    it('should use default configuration when no config files exist', async () => {
      mockFs.readFile.mockImplementation(() => 
        Promise.reject(new Error('No config files'))
      );

      process.env.FIRESITE_USE_FIREBASE = 'true';
      
      const mockFirebase = {
        initializeApp: vi.fn(),
        getApps: vi.fn(() => []),
        database: vi.fn(() => ({
          ref: vi.fn(() => ({
            set: vi.fn(() => Promise.resolve()),
            child: vi.fn(() => ({
              set: vi.fn(() => Promise.resolve()),
              onDisconnect: vi.fn(() => ({
                remove: vi.fn(() => Promise.resolve())
              }))
            }))
          }))
        })),
        credential: { cert: vi.fn(() => ({})) }
      };

      vi.stubGlobal('eval', vi.fn(() => Promise.resolve(mockFirebase)));

      const registry = new ServiceRegistry({ useFirebase: true });
      
      // Should not throw, should use defaults
      await expect(
        registry.register('default-config-service', {
          port: 3000,
          pid: 12345,
          healthUrl: '/health'
        })
      ).resolves.not.toThrow();

      // Should have used default Firesite Alpha project
      expect(mockFirebase.initializeApp).toHaveBeenCalledWith(
        expect.objectContaining({
          databaseURL: 'https://firesitetest-default-rtdb.firebaseio.com'
        })
      );
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should recover gracefully from temporary failures', async () => {
      process.env.FIRESITE_USE_FIREBASE = 'true';
      
      let attemptCount = 0;
      const mockFirebase = {
        initializeApp: vi.fn(() => {
          attemptCount++;
          if (attemptCount === 1) {
            throw new Error('Temporary initialization failure');
          }
          return mockApp;
        }),
        getApps: vi.fn(() => []),
        database: vi.fn(() => ({
          ref: vi.fn(() => ({
            set: vi.fn(() => Promise.resolve()),
            child: vi.fn(() => ({
              set: vi.fn(() => Promise.resolve()),
              onDisconnect: vi.fn(() => ({
                remove: vi.fn(() => Promise.resolve())
              }))
            }))
          }))
        })),
        credential: { cert: vi.fn(() => ({})) }
      };

      const mockApp = { name: 'test-app' };

      vi.stubGlobal('eval', vi.fn(() => Promise.resolve(mockFirebase)));

      mockFs.readFile.mockImplementation((path: string) => {
        if (path.includes('user-id')) {
          return Promise.resolve('resilient-user');
        }
        if (path.includes('registry.json')) {
          return Promise.resolve(JSON.stringify({ services: {}, lastUpdated: new Date().toISOString() }));
        }
        return Promise.resolve('{}');
      });

      const registry = new ServiceRegistry({ useFirebase: true });
      
      // First attempt should fail and fall back to file mode
      await registry.register('resilient-service', {
        port: 3000,
        pid: 12345,
        healthUrl: '/health'
      });

      // Should have fallen back to file system
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('registry.json'),
        expect.any(String),
        'utf8'
      );
    });
  });
});