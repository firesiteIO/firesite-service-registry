/**
 * Multi-User Isolation Tests
 * Tests that users are properly isolated in Firebase RTDB
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServiceRegistry } from '../core/service-registry.js';

// Mock Firebase responses for different users
const createMockFirebaseAdmin = (userId: string) => {
  const userData = {
    alice: {
      services: {
        'alice-chat': { name: 'alice-chat', port: 3000, metadata: { userId: 'alice' } },
        'alice-api': { name: 'alice-api', port: 3001, metadata: { userId: 'alice' } }
      },
      presence: {
        'alice-chat': { online: true, userId: 'alice' },
        'alice-api': { online: true, userId: 'alice' }
      }
    },
    bob: {
      services: {
        'bob-service': { name: 'bob-service', port: 3000, metadata: { userId: 'bob' } },
        'bob-worker': { name: 'bob-worker', port: 3002, metadata: { userId: 'bob' } }
      },
      presence: {
        'bob-service': { online: true, userId: 'bob' },
        'bob-worker': { online: false, userId: 'bob' }
      }
    }
  };

  const mockRef = {
    set: vi.fn(() => Promise.resolve()),
    update: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
    once: vi.fn((eventType: string) => {
      // Extract service name from the ref path
      const currentPath = mockRef._path || '';
      const serviceName = currentPath.split('/').pop();
      
      if (currentPath.includes('/services/')) {
        // Service query
        const serviceData = userData[userId]?.services[serviceName];
        return Promise.resolve({
          exists: () => !!serviceData,
          val: () => serviceData,
          key: serviceName
        });
      } else if (currentPath.includes('/presence/')) {
        // Presence query
        const presenceData = userData[userId]?.presence[serviceName];
        return Promise.resolve({
          exists: () => !!presenceData?.online,
          val: () => presenceData,
          key: serviceName
        });
      } else if (currentPath.endsWith('/services')) {
        // List all services for user
        return Promise.resolve({
          exists: () => !!userData[userId]?.services,
          val: () => userData[userId]?.services || {},
          key: null
        });
      }
      
      return Promise.resolve({
        exists: () => false,
        val: () => null,
        key: null
      });
    }),
    child: vi.fn((path: string) => {
      const newRef = { ...mockRef };
      newRef._path = `${mockRef._path || ''}/${path}`;
      return newRef;
    }),
    onDisconnect: vi.fn(() => ({
      remove: vi.fn(() => Promise.resolve()),
      set: vi.fn(() => Promise.resolve())
    }))
  };

  const mockDatabase = {
    ref: vi.fn((path: string) => {
      const newRef = { ...mockRef };
      newRef._path = path;
      return newRef;
    })
  };

  return {
    initializeApp: vi.fn(),
    getApps: vi.fn(() => []),
    database: vi.fn(() => mockDatabase),
    credential: { cert: vi.fn(() => ({})) }
  };
};

describe('Multi-User Isolation', () => {
  let aliceFirebaseMock: any;
  let bobFirebaseMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    aliceFirebaseMock = createMockFirebaseAdmin('alice');
    bobFirebaseMock = createMockFirebaseAdmin('bob');

    // Mock fs for user ID storage
    const mockFs = {
      readFile: vi.fn(),
      writeFile: vi.fn(() => Promise.resolve()),
      mkdir: vi.fn(() => Promise.resolve())
    };

    vi.doMock('fs', () => ({ promises: mockFs }));
  });

  describe('Service Discovery Isolation', () => {
    it('should only discover services from the same user', async () => {
      // Mock Alice's environment
      vi.stubGlobal('eval', vi.fn(() => Promise.resolve(aliceFirebaseMock)));
      
      const mockFs = {
        readFile: vi.fn((path: string) => {
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
        }),
        writeFile: vi.fn(),
        mkdir: vi.fn()
      };
      
      vi.doMock('fs', () => ({ promises: mockFs }));
      
      const aliceRegistry = new ServiceRegistry({ useFirebase: true });
      
      // Alice should be able to discover her own services
      const aliceService = await aliceRegistry.discover('alice-chat');
      expect(aliceService).toBeTruthy();
      expect(aliceService?.metadata?.userId).toBe('alice');
      
      // Alice should NOT be able to discover Bob's services
      const bobService = await aliceRegistry.discover('bob-service');
      expect(bobService).toBeNull();
    });

    it('should maintain separate service lists for different users', async () => {
      // Test Alice's services
      vi.stubGlobal('eval', vi.fn(() => Promise.resolve(aliceFirebaseMock)));
      
      const mockFs = {
        readFile: vi.fn((path: string) => {
          if (path.includes('user-id')) return Promise.resolve('alice');
          return Promise.resolve('{}');
        }),
        writeFile: vi.fn(),
        mkdir: vi.fn()
      };
      
      vi.doMock('fs', () => ({ promises: mockFs }));
      
      const aliceRegistry = new ServiceRegistry({ useFirebase: true });
      const aliceServices = await aliceRegistry.listServices();
      
      expect(aliceServices).toHaveLength(2);
      expect(aliceServices.every(s => s.metadata?.userId === 'alice')).toBe(true);
      
      // Test Bob's services
      vi.stubGlobal('eval', vi.fn(() => Promise.resolve(bobFirebaseMock)));
      
      mockFs.readFile.mockImplementation((path: string) => {
        if (path.includes('user-id')) return Promise.resolve('bob');
        return Promise.resolve('{}');
      });
      
      const bobRegistry = new ServiceRegistry({ useFirebase: true });
      const bobServices = await bobRegistry.listServices();
      
      // Bob should only see his online service
      expect(bobServices).toHaveLength(1);
      expect(bobServices[0].name).toBe('bob-service');
      expect(bobServices[0].metadata?.userId).toBe('bob');
    });
  });

  describe('Firebase Path Isolation', () => {
    it('should use different Firebase paths for different users', async () => {
      const testCases = [
        { userId: 'alice', expectedPath: 'firesite-dev/users/alice' },
        { userId: 'bob-smith', expectedPath: 'firesite-dev/users/bob-smith' },
        { userId: 'user-123', expectedPath: 'firesite-dev/users/user-123' }
      ];

      for (const { userId, expectedPath } of testCases) {
        const userFirebaseMock = createMockFirebaseAdmin(userId);
        vi.stubGlobal('eval', vi.fn(() => Promise.resolve(userFirebaseMock)));
        
        const mockFs = {
          readFile: vi.fn((path: string) => {
            if (path.includes('user-id')) return Promise.resolve(userId);
            return Promise.resolve('{}');
          }),
          writeFile: vi.fn(),
          mkdir: vi.fn()
        };
        
        vi.doMock('fs', () => ({ promises: mockFs }));
        
        const registry = new ServiceRegistry({ useFirebase: true });
        await registry.register('test-service', {
          port: 3000,
          pid: 12345,
          healthUrl: '/health'
        });

        // Verify correct paths were used
        expect(userFirebaseMock.database().ref).toHaveBeenCalledWith(`${expectedPath}/services`);
        expect(userFirebaseMock.database().ref).toHaveBeenCalledWith(`${expectedPath}/presence`);
      }
    });
  });

  describe('User ID Sanitization', () => {
    it('should sanitize invalid Firebase key characters', async () => {
      const testCases = [
        { input: 'user@domain.com', expected: 'user-domain-com' },
        { input: 'User Name With Spaces', expected: 'user-name-with-spaces' },
        { input: 'user#with$special%chars!', expected: 'user-with-special-chars' },
        { input: 'user...with...dots', expected: 'user-with-dots' },
        { input: '---user---', expected: 'user' },
        { input: 'UPPERCASE', expected: 'uppercase' }
      ];

      for (const { input, expected } of testCases) {
        process.env.FIRESITE_USER_ID = input;
        
        const userFirebaseMock = createMockFirebaseAdmin(expected);
        vi.stubGlobal('eval', vi.fn(() => Promise.resolve(userFirebaseMock)));
        
        const mockFs = {
          readFile: vi.fn(() => Promise.reject(new Error('No file'))),
          writeFile: vi.fn(),
          mkdir: vi.fn()
        };
        
        vi.doMock('fs', () => ({ promises: mockFs }));
        
        const registry = new ServiceRegistry({ useFirebase: true });
        await registry.register('test-service', {
          port: 3000,
          pid: 12345,
          healthUrl: '/health',
          metadata: { test: true }
        });

        // Verify sanitized user ID was used in metadata
        const setCall = userFirebaseMock.database().ref().set.mock.calls[0];
        expect(setCall[0].metadata.userId).toBe(expected);
        
        delete process.env.FIRESITE_USER_ID;
      }
    });

    it('should handle edge cases in user ID generation', async () => {
      const testCases = [
        { input: '', expected: 'unknown-user' },
        { input: '!!!@@@###', expected: 'unknown-user' },
        { input: 'a'.repeat(100), expected: 'a'.repeat(50) }, // Length limit
        { input: '123', expected: '123' }
      ];

      for (const { input, expected } of testCases) {
        process.env.FIRESITE_USER_ID = input;
        
        const userFirebaseMock = createMockFirebaseAdmin(expected);
        vi.stubGlobal('eval', vi.fn(() => Promise.resolve(userFirebaseMock)));
        
        const mockFs = {
          readFile: vi.fn(() => Promise.reject(new Error('No file'))),
          writeFile: vi.fn(),
          mkdir: vi.fn()
        };
        
        vi.doMock('fs', () => ({ promises: mockFs }));
        
        const registry = new ServiceRegistry({ useFirebase: true });
        await registry.register('test-service', {
          port: 3000,
          pid: 12345,
          healthUrl: '/health'
        });

        const setCall = userFirebaseMock.database().ref().set.mock.calls[0];
        expect(setCall[0].metadata.userId).toBe(expected);
        
        delete process.env.FIRESITE_USER_ID;
      }
    });
  });

  describe('Concurrent User Operations', () => {
    it('should handle multiple users registering services simultaneously', async () => {
      const users = ['alice', 'bob', 'charlie'];
      const registries = [];
      const promises = [];

      for (const userId of users) {
        const userFirebaseMock = createMockFirebaseAdmin(userId);
        vi.stubGlobal('eval', vi.fn(() => Promise.resolve(userFirebaseMock)));
        
        const mockFs = {
          readFile: vi.fn((path: string) => {
            if (path.includes('user-id')) return Promise.resolve(userId);
            return Promise.resolve('{}');
          }),
          writeFile: vi.fn(),
          mkdir: vi.fn()
        };
        
        vi.doMock('fs', () => ({ promises: mockFs }));
        
        const registry = new ServiceRegistry({ useFirebase: true });
        registries.push({ registry, userId, firebase: userFirebaseMock });
        
        promises.push(
          registry.register(`${userId}-service`, {
            port: 3000 + users.indexOf(userId),
            pid: 12345 + users.indexOf(userId),
            healthUrl: '/health'
          })
        );
      }

      await Promise.all(promises);

      // Verify each user used their own Firebase paths
      for (const { firebase, userId } of registries) {
        expect(firebase.database().ref).toHaveBeenCalledWith(`firesite-dev/users/${userId}/services`);
        expect(firebase.database().ref).toHaveBeenCalledWith(`firesite-dev/users/${userId}/presence`);
      }
    });
  });

  describe('User Context in Service Metadata', () => {
    it('should include comprehensive user context in service metadata', async () => {
      const userId = 'test-developer';
      const userFirebaseMock = createMockFirebaseAdmin(userId);
      vi.stubGlobal('eval', vi.fn(() => Promise.resolve(userFirebaseMock)));
      
      const mockFs = {
        readFile: vi.fn((path: string) => {
          if (path.includes('user-id')) return Promise.resolve(userId);
          return Promise.resolve('{}');
        }),
        writeFile: vi.fn(),
        mkdir: vi.fn()
      };
      
      vi.doMock('fs', () => ({ promises: mockFs }));
      
      // Mock os module
      vi.doMock('os', () => ({
        hostname: vi.fn(() => 'developer-macbook'),
        userInfo: vi.fn(() => ({ username: 'developer' }))
      }));
      
      const registry = new ServiceRegistry({ useFirebase: true });
      await registry.register('dev-service', {
        port: 3000,
        pid: 12345,
        healthUrl: '/health',
        metadata: { environment: 'development' }
      });

      const setCall = userFirebaseMock.database().ref().set.mock.calls[0];
      const serviceData = setCall[0];
      
      expect(serviceData.metadata).toEqual(
        expect.objectContaining({
          environment: 'development', // Custom metadata preserved
          userId: 'test-developer',
          hostname: 'developer-macbook',
          nodeVersion: process.version,
          platform: process.platform,
          sessionId: expect.stringMatching(/^test-developer-\d+$/)
        })
      );
    });

    it('should include user context in presence data', async () => {
      const userId = 'test-user';
      const userFirebaseMock = createMockFirebaseAdmin(userId);
      vi.stubGlobal('eval', vi.fn(() => Promise.resolve(userFirebaseMock)));
      
      const mockFs = {
        readFile: vi.fn((path: string) => {
          if (path.includes('user-id')) return Promise.resolve(userId);
          return Promise.resolve('{}');
        }),
        writeFile: vi.fn(),
        mkdir: vi.fn()
      };
      
      vi.doMock('fs', () => ({ promises: mockFs }));
      
      const registry = new ServiceRegistry({ useFirebase: true });
      await registry.register('test-service', {
        port: 3000,
        pid: 12345,
        healthUrl: '/health'
      });

      // Second set call should be presence data
      const presenceCall = userFirebaseMock.database().ref().set.mock.calls[1];
      const presenceData = presenceCall[0];
      
      expect(presenceData).toEqual(
        expect.objectContaining({
          online: true,
          pid: 12345,
          userId: 'test-user',
          hostname: expect.any(String),
          lastSeen: expect.any(String)
        })
      );
    });
  });
});