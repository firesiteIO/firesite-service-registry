/**
 * Firebase Service Registry Tests
 * Tests the Firebase implementation with user isolation and real-time features
 */

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { FirebaseServiceRegistry } from '../node/firebase-registry.js';
import type { ServiceInfo, RegisterOptions } from '../types/index.js';

// Mock child_process for git commands
vi.mock('child_process', () => ({
  exec: vi.fn()
}));

// Mock os module
vi.mock('os', () => ({
  homedir: vi.fn(() => '/mock/home'),
  hostname: vi.fn(() => 'test-hostname'),
  userInfo: vi.fn(() => ({ username: 'testuser' }))
}));

// Mock Firebase Admin SDK
const mockDatabase = {
  ref: vi.fn(() => mockRef),
  goOffline: vi.fn(),
  goOnline: vi.fn()
};

const mockRef = {
  set: vi.fn(() => Promise.resolve()),
  update: vi.fn(() => Promise.resolve()),
  remove: vi.fn(() => Promise.resolve()),
  on: vi.fn(),
  off: vi.fn(),
  once: vi.fn(() => Promise.resolve(mockSnapshot)),
  onDisconnect: vi.fn(() => mockOnDisconnect),
  child: vi.fn(() => mockRef)
};

const mockOnDisconnect = {
  remove: vi.fn(() => Promise.resolve()),
  set: vi.fn(() => Promise.resolve())
};

const mockSnapshot = {
  val: vi.fn(() => null),
  key: 'test-service',
  exists: vi.fn(() => false)
};

const mockFirebaseAdmin = {
  initializeApp: vi.fn(() => mockApp),
  getApps: vi.fn(() => []),
  getApp: vi.fn(() => mockApp),
  database: vi.fn(() => mockDatabase),
  credential: {
    cert: vi.fn(() => ({}))
  }
};

const mockApp = {
  name: 'test-app'
};

// Mock the dynamic import of firebase-admin
vi.stubGlobal('eval', vi.fn((code) => {
  if (code.includes('import("firebase-admin")')) {
    return Promise.resolve(mockFirebaseAdmin);
  }
  return Promise.reject(new Error('Unknown import'));
}));

describe('FirebaseServiceRegistry', () => {
  let registry: FirebaseServiceRegistry;
  let mockFs: any;

  beforeAll(() => {
    // Mock fs module
    mockFs = {
      readFile: vi.fn(),
      writeFile: vi.fn(() => Promise.resolve()),
      mkdir: vi.fn(() => Promise.resolve()),
      access: vi.fn(() => Promise.resolve())
    };
    
    vi.doMock('fs', () => ({
      promises: mockFs
    }));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new FirebaseServiceRegistry();
    
    // Reset mock implementations
    mockRef.set.mockResolvedValue(undefined);
    mockRef.update.mockResolvedValue(undefined);
    mockRef.remove.mockResolvedValue(undefined);
    mockRef.once.mockResolvedValue(mockSnapshot);
    mockSnapshot.val.mockReturnValue(null);
    mockSnapshot.exists.mockReturnValue(false);
    
    // Mock config file reading
    mockFs.readFile.mockImplementation((path: string) => {
      if (path.includes('config.json')) {
        return Promise.resolve(JSON.stringify({
          firebase: {
            projectId: 'firesitetest',
            databaseURL: 'https://firesitetest-default-rtdb.firebaseio.com'
          },
          registry: {
            rtdbPath: 'firesite-dev'
          }
        }));
      }
      if (path.includes('user-id')) {
        return Promise.resolve('test-user-123');
      }
      return Promise.reject(new Error('File not found'));
    });
  });

  afterEach(() => {
    if (registry && typeof registry.dispose === 'function') {
      registry.dispose();
    }
  });

  describe('User Identification', () => {
    it('should use environment variable for user ID if set', async () => {
      process.env.FIRESITE_USER_ID = 'custom-user';
      
      const testRegistry = new FirebaseServiceRegistry({ useFirebase: true });
      await testRegistry.register('test-service', {
        port: 3000,
        pid: 12345,
        healthUrl: '/health'
      });

      expect(mockRef.set).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            userId: 'custom-user'
          })
        })
      );

      delete process.env.FIRESITE_USER_ID;
    });

    it('should use git email as user ID when available', async () => {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = vi.fn().mockResolvedValue({ stdout: 'john.doe@example.com\n' });
      
      vi.mocked(promisify).mockReturnValue(execAsync);
      
      const testRegistry = new FirebaseServiceRegistry({ useFirebase: true });
      await testRegistry.register('test-service', {
        port: 3000,
        pid: 12345,
        healthUrl: '/health'
      });

      expect(mockRef.set).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            userId: 'john-doe'
          })
        })
      );
    });

    it('should fall back to system username when git is not available', async () => {
      const { promisify } = require('util');
      const execAsync = vi.fn().mockRejectedValue(new Error('Git not found'));
      
      vi.mocked(promisify).mockReturnValue(execAsync);
      
      const testRegistry = new FirebaseServiceRegistry({ useFirebase: true });
      await testRegistry.register('test-service', {
        port: 3000,
        pid: 12345,
        healthUrl: '/health'
      });

      expect(mockRef.set).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            userId: 'testuser'
          })
        })
      );
    });

    it('should use stored user ID when available', async () => {
      const testRegistry = new FirebaseServiceRegistry({ useFirebase: true });
      await testRegistry.register('test-service', {
        port: 3000,
        pid: 12345,
        healthUrl: '/health'
      });

      expect(mockRef.set).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            userId: 'test-user-123'
          })
        })
      );
    });

    it('should sanitize user IDs for Firebase compatibility', async () => {
      process.env.FIRESITE_USER_ID = 'User@Name.With#Invalid$Chars!';
      
      const testRegistry = new FirebaseServiceRegistry({ useFirebase: true });
      await testRegistry.register('test-service', {
        port: 3000,
        pid: 12345,
        healthUrl: '/health'
      });

      expect(mockRef.set).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            userId: 'user-name-with-invalid-chars'
          })
        })
      );

      delete process.env.FIRESITE_USER_ID;
    });
  });

  describe('User Namespace Isolation', () => {
    it('should create user-specific paths in Firebase', async () => {
      mockFs.readFile.mockImplementation((path: string) => {
        if (path.includes('user-id')) {
          return Promise.resolve('alice');
        }
        if (path.includes('config.json')) {
          return Promise.resolve(JSON.stringify({
            firebase: { projectId: 'firesitetest' },
            registry: { rtdbPath: 'firesite-dev' }
          }));
        }
        return Promise.reject(new Error('File not found'));
      });

      const testRegistry = new FirebaseServiceRegistry({ useFirebase: true });
      await testRegistry.register('test-service', {
        port: 3000,
        pid: 12345,
        healthUrl: '/health'
      });

      // Verify that Firebase ref was called with user-specific path
      expect(mockDatabase.ref).toHaveBeenCalledWith('firesite-dev/users/alice/services');
      expect(mockDatabase.ref).toHaveBeenCalledWith('firesite-dev/users/alice/presence');
    });

    it('should isolate services between different users', async () => {
      // Simulate two different users
      const userAliceId = 'alice';
      const userBobId = 'bob';

      // Test Alice's services
      mockFs.readFile.mockImplementation((path: string) => {
        if (path.includes('user-id')) {
          return Promise.resolve(userAliceId);
        }
        return Promise.resolve('{}');
      });

      const aliceRegistry = new FirebaseServiceRegistry({ useFirebase: true });
      await aliceRegistry.register('alice-service', {
        port: 3000,
        pid: 12345,
        healthUrl: '/health'
      });

      // Reset mocks and test Bob's services
      vi.clearAllMocks();
      mockFs.readFile.mockImplementation((path: string) => {
        if (path.includes('user-id')) {
          return Promise.resolve(userBobId);
        }
        return Promise.resolve('{}');
      });

      const bobRegistry = new FirebaseServiceRegistry({ useFirebase: true });
      await bobRegistry.register('bob-service', {
        port: 3001,
        pid: 12346,
        healthUrl: '/health'
      });

      // Verify different paths were used
      expect(mockDatabase.ref).toHaveBeenCalledWith('firesite-dev/users/bob/services');
      expect(mockDatabase.ref).toHaveBeenCalledWith('firesite-dev/users/bob/presence');
    });
  });

  describe('Service Registration with User Context', () => {
    it('should include user metadata in registered services', async () => {
      const testRegistry = new FirebaseServiceRegistry({ useFirebase: true });
      
      await testRegistry.register('test-service', {
        port: 3000,
        pid: 12345,
        healthUrl: '/health',
        metadata: { custom: 'data' }
      });

      expect(mockRef.set).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-service',
          port: 3000,
          pid: 12345,
          status: 'running',
          metadata: expect.objectContaining({
            custom: 'data',
            userId: 'test-user-123',
            hostname: 'test-hostname',
            nodeVersion: process.version,
            platform: process.platform,
            sessionId: expect.stringMatching(/^test-user-123-\d+$/)
          })
        })
      );
    });

    it('should register presence with user information', async () => {
      const testRegistry = new FirebaseServiceRegistry({ useFirebase: true });
      
      await testRegistry.register('test-service', {
        port: 3000,
        pid: 12345,
        healthUrl: '/health'
      });

      // Verify presence registration (second set call)
      expect(mockRef.set).toHaveBeenCalledTimes(2);
      expect(mockRef.set).toHaveBeenLastCalledWith(
        expect.objectContaining({
          online: true,
          pid: 12345,
          userId: 'test-user-123',
          hostname: 'test-hostname',
          lastSeen: expect.any(String)
        })
      );
    });

    it('should set up automatic cleanup on disconnect', async () => {
      const testRegistry = new FirebaseServiceRegistry({ useFirebase: true });
      
      await testRegistry.register('test-service', {
        port: 3000,
        pid: 12345,
        healthUrl: '/health'
      });

      expect(mockRef.onDisconnect).toHaveBeenCalled();
      expect(mockOnDisconnect.remove).toHaveBeenCalled();
    });
  });

  describe('Service Discovery with User Isolation', () => {
    it('should only discover services from the same user namespace', async () => {
      const serviceData = {
        name: 'test-service',
        port: 3000,
        pid: 12345,
        status: 'running',
        startedAt: '2023-01-01T00:00:00Z',
        metadata: { userId: 'test-user-123' }
      };

      mockSnapshot.exists.mockReturnValue(true);
      mockSnapshot.val.mockReturnValue(serviceData);

      const testRegistry = new FirebaseServiceRegistry({ useFirebase: true });
      const discovered = await testRegistry.discover('test-service');

      expect(discovered).toEqual(serviceData);
      expect(mockRef.child).toHaveBeenCalledWith('test-service');
    });

    it('should check presence before returning discovered service', async () => {
      const serviceData = {
        name: 'test-service',
        port: 3000,
        pid: 12345,
        status: 'running',
        startedAt: '2023-01-01T00:00:00Z'
      };

      const presenceData = {
        online: true,
        lastSeen: '2023-01-01T00:01:00Z',
        userId: 'test-user-123'
      };

      // Mock service discovery
      let callCount = 0;
      mockRef.once.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: service data
          return Promise.resolve({
            exists: () => true,
            val: () => serviceData,
            key: 'test-service'
          });
        } else {
          // Second call: presence data
          return Promise.resolve({
            exists: () => true,
            val: () => presenceData,
            key: 'test-service'
          });
        }
      });

      const testRegistry = new FirebaseServiceRegistry({ useFirebase: true });
      const discovered = await testRegistry.discover('test-service');

      expect(discovered).toEqual(serviceData);
      expect(mockRef.once).toHaveBeenCalledTimes(2); // Once for service, once for presence
    });

    it('should remove offline services during discovery', async () => {
      const serviceData = {
        name: 'test-service',
        port: 3000,
        pid: 12345,
        status: 'running',
        startedAt: '2023-01-01T00:00:00Z'
      };

      // Mock service exists but presence shows offline
      let callCount = 0;
      mockRef.once.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            exists: () => true,
            val: () => serviceData,
            key: 'test-service'
          });
        } else {
          // Presence is offline/missing
          return Promise.resolve({
            exists: () => false,
            val: () => null,
            key: 'test-service'
          });
        }
      });

      const testRegistry = new FirebaseServiceRegistry({ useFirebase: true });
      const discovered = await testRegistry.discover('test-service');

      expect(discovered).toBeNull();
      expect(mockRef.remove).toHaveBeenCalled(); // Service should be removed
    });
  });

  describe('Multi-User Service Listing', () => {
    it('should only list services from current user namespace', async () => {
      const servicesData = {
        'service-1': {
          name: 'service-1',
          port: 3000,
          metadata: { userId: 'test-user-123' }
        },
        'service-2': {
          name: 'service-2',
          port: 3001,
          metadata: { userId: 'test-user-123' }
        }
      };

      const presenceData = {
        'service-1': { online: true, userId: 'test-user-123' },
        'service-2': { online: false, userId: 'test-user-123' }
      };

      let callCount = 0;
      mockRef.once.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Services data
          return Promise.resolve({
            exists: () => true,
            val: () => servicesData,
            key: null
          });
        } else {
          // Presence data for individual services
          const serviceName = callCount === 2 ? 'service-1' : 'service-2';
          return Promise.resolve({
            exists: () => presenceData[serviceName].online,
            val: () => presenceData[serviceName],
            key: serviceName
          });
        }
      });

      const testRegistry = new FirebaseServiceRegistry({ useFirebase: true });
      const services = await testRegistry.listServices();

      // Only online services should be returned
      expect(services).toHaveLength(1);
      expect(services[0].name).toBe('service-1');
    });
  });

  describe('Health Monitoring with User Context', () => {
    it('should include user context in health check updates', async () => {
      const testRegistry = new FirebaseServiceRegistry({ useFirebase: true });
      
      // Mock successful health check
      vi.stubGlobal('fetch', vi.fn(() => 
        Promise.resolve({ ok: true } as Response)
      ));

      await testRegistry.checkHealth('test-service');

      // Should have called the health endpoint
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'User-Agent': '@firesite/service-registry-firebase'
          })
        })
      );
    });
  });

  describe('Configuration Loading', () => {
    it('should load user-specific configuration paths', async () => {
      const testRegistry = new FirebaseServiceRegistry({ useFirebase: true });
      
      // Trigger initialization which loads config
      await testRegistry.register('test-service', {
        port: 3000,
        pid: 12345,
        healthUrl: '/health'
      });

      // Should have attempted to read from multiple config paths
      expect(mockFs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('config.json'),
        'utf8'
      );
    });

    it('should use default Firesite Alpha configuration when config files missing', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));
      
      const testRegistry = new FirebaseServiceRegistry({ useFirebase: true });
      await testRegistry.register('test-service', {
        port: 3000,
        pid: 12345,
        healthUrl: '/health'
      });

      // Should still initialize with defaults
      expect(mockFirebaseAdmin.initializeApp).toHaveBeenCalled();
    });
  });

  describe('Error Handling and Fallback', () => {
    it('should fall back to file-based registry when Firebase fails', async () => {
      // Mock Firebase initialization failure
      vi.stubGlobal('eval', vi.fn(() => 
        Promise.reject(new Error('Firebase Admin SDK not available'))
      ));

      const testRegistry = new FirebaseServiceRegistry({ useFirebase: true });
      
      // Should not throw error, should use fallback
      await expect(
        testRegistry.register('test-service', {
          port: 3000,
          pid: 12345,
          healthUrl: '/health'
        })
      ).resolves.not.toThrow();
    });

    it('should handle user ID generation gracefully', async () => {
      // Mock all user ID methods failing
      mockFs.readFile.mockRejectedValue(new Error('No user ID'));
      
      const { promisify } = require('util');
      const execAsync = vi.fn().mockRejectedValue(new Error('Git failed'));
      vi.mocked(promisify).mockReturnValue(execAsync);
      
      const os = require('os');
      os.userInfo.mockImplementation(() => {
        throw new Error('No user info');
      });

      const testRegistry = new FirebaseServiceRegistry({ useFirebase: true });
      await testRegistry.register('test-service', {
        port: 3000,
        pid: 12345,
        healthUrl: '/health'
      });

      // Should have generated a unique ID
      expect(mockRef.set).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            userId: expect.stringMatching(/^user-\d+-[a-z0-9]+$/)
          })
        })
      );
    });
  });

  describe('Cleanup and Disposal', () => {
    it('should unregister service on disposal', async () => {
      const testRegistry = new FirebaseServiceRegistry({ useFirebase: true });
      
      await testRegistry.register('test-service', {
        port: 3000,
        pid: 12345,
        healthUrl: '/health'
      });

      // Trigger disposal
      testRegistry.dispose();

      // Should call unregister internally
      expect(mockRef.remove).toHaveBeenCalled();
    });
  });
});