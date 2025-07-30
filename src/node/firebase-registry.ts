/**
 * Firebase Realtime Database service registry implementation
 * Provides real-time presence detection and automatic cleanup
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import {
  IServiceRegistry,
  ServiceInfo,
  RegisterOptions,
  DiscoverOptions,
  HealthCheckOptions,
  ServiceRegistryConfig,
  Environment,
  ServiceNotFoundError,
  RegistryUnavailableError,
} from '../types/index.js';

// Firebase Admin SDK types (will be dynamically imported)
interface Database {
  ref(path?: string): DatabaseReference;
  goOffline(): Promise<void>;
  goOnline(): Promise<void>;
}

interface DatabaseReference {
  set(value: any): Promise<void>;
  update(values: any): Promise<void>;
  remove(): Promise<void>;
  on(eventType: string, callback: (snapshot: DataSnapshot) => void): void;
  off(eventType?: string, callback?: (snapshot: DataSnapshot) => void): void;
  once(eventType: string): Promise<DataSnapshot>;
  onDisconnect(): OnDisconnect;
  child(path: string): DatabaseReference;
}

interface DataSnapshot {
  val(): any;
  key: string | null;
  exists(): boolean;
}

interface OnDisconnect {
  remove(): Promise<void>;
  set(value: any): Promise<void>;
}

export class FirebaseServiceRegistry implements IServiceRegistry {
  private config: ServiceRegistryConfig & {
    registryPath: string;
    registryApiUrl: string;
    healthCheckTimeout: number;
    retryAttempts: number;
    retryDelay: number;
    cleanupInterval: number;
    serviceTimeout: number;
  };
  private database?: Database;
  private servicesRef?: DatabaseReference;
  private presenceRef?: DatabaseReference;
  private isInitialized = false;
  private currentServiceName?: string;
  private fallbackRegistry: import('./node-registry.js').NodeServiceRegistry;

  constructor(config: ServiceRegistryConfig = {}) {
    this.config = {
      registryPath: join(homedir(), '.firesite', 'registry.json'),
      registryApiUrl: '', // Not used in Firebase mode
      healthCheckTimeout: 5000,
      retryAttempts: 3,
      retryDelay: 1000,
      cleanupInterval: 60000, // 1 minute
      serviceTimeout: 300000, // 5 minutes
      firebaseConfig: undefined, // Firebase config will be loaded from environment
      useFirebase: true,
      ...config,
    };

    // Create fallback file-based registry
    this.fallbackRegistry = this.createFallbackRegistry(config);
  }

  /**
   * Create fallback registry instance
   */
  private createFallbackRegistry(config: ServiceRegistryConfig): any {
    try {
      // Try to require NodeServiceRegistry synchronously
      const { NodeServiceRegistry } = require('./node-registry.js');
      return new NodeServiceRegistry(config);
    } catch (error: any) {
      // For testing or when node-registry is not available, create a mock
      return {
        configure: () => {},
        register: () => Promise.resolve(),
        discover: () => Promise.resolve(null),
        unregister: () => Promise.resolve(),
        checkHealth: () => Promise.resolve(false),
        listServices: () => Promise.resolve([]),
        cleanup: () => Promise.resolve(),
        getEnvironment: () => 'node' as const,
        dispose: () => {}
      };
    }
  }

  /**
   * Initialize Firebase connection
   */
  private async initializeFirebase(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Load Firesite configuration
      const firesiteConfig = await this.loadFiresiteConfig();
      
      // Dynamically import Firebase Admin SDK
      let admin: any;
      try {
        // Use eval to avoid TypeScript checking the import at compile time
        admin = await (eval('import("firebase-admin")') as Promise<any>);
      } catch (error) {
        throw new Error('Firebase Admin SDK not available. Install with: npm install firebase-admin');
      }
      
      // Initialize Firebase app if not already done
      if (!admin.getApps().length) {
        // Try to find Firebase service account key
        const serviceAccountPaths = [
          join(homedir(), '.firesite', 'service-account.json'),
          join(process.cwd(), 'service-account.json'),
          join(process.cwd(), 'firebase-service-account.json'),
        ];

        let serviceAccount = null;
        for (const path of serviceAccountPaths) {
          try {
            const data = await fs.readFile(path, 'utf8');
            serviceAccount = JSON.parse(data);
            break;
          } catch (error) {
            // Continue to next path
          }
        }

        if (!serviceAccount && process.env.FIREBASE_SERVICE_ACCOUNT) {
          try {
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
          } catch (error) {
            console.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT environment variable');
          }
        }

        // Use Firesite Alpha project configuration
        const databaseURL = firesiteConfig?.firebase?.databaseURL || 'https://firesitetest-default-rtdb.firebaseio.com';
        
        if (serviceAccount) {
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL,
          });
        } else {
          // Create a minimal service account for development using Firesite Alpha project
          const devServiceAccount = {
            type: "service_account",
            project_id: firesiteConfig?.firebase?.projectId || "firesitetest",
            private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || "dev-key",
            private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') || this.generateDevKey(),
            client_email: process.env.FIREBASE_CLIENT_EMAIL || `firebase-adminsdk@${firesiteConfig?.firebase?.projectId || "firesitetest"}.iam.gserviceaccount.com`,
            client_id: process.env.FIREBASE_CLIENT_ID || "dev-client",
            auth_uri: "https://accounts.google.com/o/oauth2/auth",
            token_uri: "https://oauth2.googleapis.com/token",
            auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
            client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk%40${firesiteConfig?.firebase?.projectId || "firesitetest"}.iam.gserviceaccount.com`
          };

          try {
            admin.initializeApp({
              credential: admin.credential.cert(devServiceAccount),
              databaseURL,
            });
          } catch (error) {
            // If service account approach fails, try with just database URL for development
            console.warn('Service account initialization failed, trying database-only mode for development');
            admin.initializeApp({
              databaseURL,
            });
          }
        }
      }

      this.database = admin.database();
      
      // Use configured paths with user-specific namespacing
      const userId = await this.getUserId();
      const basePath = firesiteConfig?.registry?.rtdbPath || 'firesite-dev';
      const servicesPath = `${basePath}/users/${userId}/services`;
      const presencePath = `${basePath}/users/${userId}/presence`;
      
      this.servicesRef = this.database!.ref(servicesPath);
      this.presenceRef = this.database!.ref(presencePath);
      
      console.log(`Firebase registry initialized for user: ${userId}`);

      this.isInitialized = true;
      console.log(`Firebase Service Registry initialized successfully (${firesiteConfig?.firebase?.projectId || 'firesitetest'})`);
    } catch (error) {
      console.warn('Failed to initialize Firebase, falling back to file-based registry:', error);
      this.isInitialized = false;
    }
  }

  /**
   * Load Firesite configuration
   */
  private async loadFiresiteConfig(): Promise<any> {
    // Get ES module equivalent of __dirname
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    
    const configPaths = [
      join(homedir(), '.firesite', 'config.json'),
      join(process.cwd(), '.firesite-config.json'),
      join(__dirname, '../../.firesite-config.json'),
    ];

    for (const path of configPaths) {
      try {
        const data = await fs.readFile(path, 'utf8');
        return JSON.parse(data);
      } catch (error) {
        // Continue to next path
      }
    }

    // Return default Firesite Alpha configuration
    return {
      firebase: {
        projectId: "firesitetest",
        databaseURL: "https://firesitetest-default-rtdb.firebaseio.com",
      },
      registry: {
        rtdbPath: "firesite-dev/services",
        presencePath: "firesite-dev/presence"
      }
    };
  }

  /**
   * Generate a development key placeholder
   */
  private generateDevKey(): string {
    return '-----BEGIN PRIVATE KEY-----\nDEV_KEY_PLACEHOLDER\n-----END PRIVATE KEY-----\n';
  }

  /**
   * Get unique user identifier for multi-user isolation
   */
  private async getUserId(): Promise<string> {
    // Priority order for user identification:
    // 1. Environment variable (explicit override)
    // 2. Git user configuration (most common)
    // 3. System username
    // 4. Generated unique ID (stored locally)
    
    if (process.env.FIRESITE_USER_ID) {
      return this.sanitizeUserId(process.env.FIRESITE_USER_ID);
    }

    // Try to get Git user info
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      const { stdout: gitEmail } = await execAsync('git config user.email', { timeout: 1000 });
      if (gitEmail?.trim()) {
        // Use first part of email as user ID
        const userId = gitEmail.trim().split('@')[0];
        return this.sanitizeUserId(userId);
      }
    } catch (error) {
      // Git not available or not configured
    }

    // Fall back to system username
    try {
      const os = require('os');
      const username = os.userInfo().username;
      if (username) {
        return this.sanitizeUserId(username);
      }
    } catch (error) {
      // System username not available
    }

    // Generate and store a unique ID
    return this.getOrCreateUniqueId();
  }

  /**
   * Sanitize user ID for Firebase key compatibility
   */
  private sanitizeUserId(userId: string): string {
    return userId
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-') // Replace invalid chars with dash
      .replace(/-+/g, '-') // Collapse multiple dashes
      .replace(/^-|-$/g, '') // Remove leading/trailing dashes
      .substring(0, 50) // Limit length
      || 'unknown-user';
  }

  /**
   * Get or create a persistent unique ID for this user
   */
  private async getOrCreateUniqueId(): Promise<string> {
    const userIdPath = join(homedir(), '.firesite', 'user-id');
    
    try {
      // Try to read existing user ID
      const existingId = await fs.readFile(userIdPath, 'utf8');
      if (existingId?.trim()) {
        return this.sanitizeUserId(existingId.trim());
      }
    } catch (error) {
      // File doesn't exist, will create new one
    }

    // Generate new unique ID
    const uniqueId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const sanitizedId = this.sanitizeUserId(uniqueId);

    try {
      // Ensure directory exists
      await fs.mkdir(join(homedir(), '.firesite'), { recursive: true });
      // Store the ID for future use
      await fs.writeFile(userIdPath, sanitizedId, 'utf8');
    } catch (error: any) {
      console.warn('Failed to store user ID, using temporary ID:', error.message);
    }

    return sanitizedId;
  }

  /**
   * Configure the registry
   */
  configure(config: ServiceRegistryConfig): void {
    this.config = { ...this.config, ...config };
    this.fallbackRegistry.configure(config);
  }

  /**
   * Get current environment
   */
  getEnvironment(): Environment {
    return 'node';
  }

  /**
   * Register a service with real-time presence
   */
  async register(name: string, options: RegisterOptions): Promise<void> {
    await this.initializeFirebase();

    if (!this.isInitialized || !this.servicesRef || !this.presenceRef) {
      // Fallback to file-based registry
      return this.fallbackRegistry.register(name, options);
    }

    try {
      const now = new Date().toISOString();
      const userId = await this.getUserId();
      const serviceInfo: ServiceInfo = {
        name,
        port: options.port,
        pid: options.pid || process.pid,
        status: 'running',
        startedAt: now,
        healthUrl: options.healthUrl,
        healthCheckUrl: options.healthUrl ? `http://localhost:${options.port}${options.healthUrl}` : undefined,
        metadata: {
          ...options.metadata,
          userId,
          hostname: require('os').hostname(),
          nodeVersion: process.version,
          platform: process.platform,
          sessionId: `${userId}-${Date.now()}`,
        },
        lastHealthCheck: now,
        isHealthy: true,
      };

      // Register service information
      await this.servicesRef.child(name).set(serviceInfo);

      // Set up presence detection
      const presenceRef = this.presenceRef.child(name);

      // Set up automatic cleanup on disconnect
      await presenceRef.onDisconnect().remove();
      
      // Set presence to online
      await presenceRef.set({
        online: true,
        lastSeen: now,
        pid: serviceInfo.pid,
        userId,
        hostname: require('os').hostname(),
      });

      // Track this service for cleanup
      this.currentServiceName = name;

      // Set up periodic health updates
      this.startHealthUpdates(name, options.healthUrl, options.port);

      console.log(`Service '${name}' registered with Firebase presence detection`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new RegistryUnavailableError(
        `Failed to register service '${name}' with Firebase: ${errorMessage}`,
        { error, name, options }
      );
    }
  }

  /**
   * Discover a service by name
   */
  async discover(name: string, options: DiscoverOptions = {}): Promise<ServiceInfo | null> {
    await this.initializeFirebase();

    if (!this.isInitialized || !this.servicesRef) {
      return this.fallbackRegistry.discover(name, options);
    }

    try {
      const snapshot = await this.servicesRef.child(name).once('value');
      
      if (!snapshot.exists()) {
        return null;
      }

      const service = snapshot.val() as ServiceInfo;

      // Check if service is actually online using presence
      const presenceSnapshot = await this.presenceRef!.child(name).once('value');
      const presence = presenceSnapshot.val();

      if (!presence || !presence.online) {
        // Service is offline, remove from registry
        await this.servicesRef.child(name).remove();
        return null;
      }

      // Optionally perform health check
      if (options.includeHealth && service.healthCheckUrl) {
        try {
          const isHealthy = await this.performHealthCheck(service.healthCheckUrl, { 
            timeout: options.timeout || this.config.healthCheckTimeout 
          });
          service.isHealthy = isHealthy;
          service.lastHealthCheck = new Date().toISOString();
          
          // Update registry with health info
          await this.servicesRef.child(name).update({
            isHealthy,
            lastHealthCheck: service.lastHealthCheck,
          });
        } catch (healthError) {
          service.isHealthy = false;
          service.lastHealthCheck = new Date().toISOString();
        }
      }

      return service;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new RegistryUnavailableError(
        `Failed to discover service '${name}': ${errorMessage}`,
        { error, name, options }
      );
    }
  }

  /**
   * Unregister a service
   */
  async unregister(name: string): Promise<void> {
    await this.initializeFirebase();

    if (!this.isInitialized || !this.servicesRef) {
      return this.fallbackRegistry.unregister(name);
    }

    try {
      // Remove from services
      await this.servicesRef.child(name).remove();
      
      // Remove from presence
      await this.presenceRef!.child(name).remove();

      console.log(`Service '${name}' unregistered from Firebase registry`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new RegistryUnavailableError(
        `Failed to unregister service '${name}': ${errorMessage}`,
        { error, name }
      );
    }
  }

  /**
   * Check if a service is healthy
   */
  async checkHealth(name: string, options: HealthCheckOptions = {}): Promise<boolean> {
    const service = await this.discover(name);
    
    if (!service) {
      throw new ServiceNotFoundError(name);
    }

    if (!service.healthCheckUrl) {
      return true; // Assume healthy if no health check URL
    }

    return this.performHealthCheck(service.healthCheckUrl, {
      timeout: options.timeout || this.config.healthCheckTimeout,
    });
  }

  /**
   * List all registered services
   */
  async listServices(): Promise<ServiceInfo[]> {
    await this.initializeFirebase();

    if (!this.isInitialized || !this.servicesRef) {
      return this.fallbackRegistry.listServices();
    }

    try {
      const snapshot = await this.servicesRef.once('value');
      
      if (!snapshot.exists()) {
        return [];
      }

      const services = snapshot.val();
      const serviceList: ServiceInfo[] = [];

      // Check presence for each service
      for (const [serviceName, serviceInfo] of Object.entries(services)) {
        const presenceSnapshot = await this.presenceRef!.child(serviceName).once('value');
        const presence = presenceSnapshot.val();

        if (presence && presence.online) {
          serviceList.push(serviceInfo as ServiceInfo);
        } else {
          // Remove offline service
          await this.servicesRef.child(serviceName).remove();
        }
      }

      return serviceList;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new RegistryUnavailableError(
        `Failed to list services: ${errorMessage}`,
        { error }
      );
    }
  }

  /**
   * Clean up stale services (automatic with Firebase presence)
   */
  async cleanup(): Promise<void> {
    // With Firebase presence, cleanup is automatic
    // But we can still manually verify health checks
    const services = await this.listServices();
    
    for (const service of services) {
      if (service.healthCheckUrl) {
        try {
          const isHealthy = await this.performHealthCheck(service.healthCheckUrl, { timeout: 2000 });
          if (!isHealthy) {
            await this.unregister(service.name);
          }
        } catch (error) {
          await this.unregister(service.name);
        }
      }
    }
  }

  /**
   * Dispose of the registry
   */
  dispose(): void {
    if (this.currentServiceName) {
      // Clean up presence on exit
      this.unregister(this.currentServiceName).catch(console.error);
    }
    
    this.fallbackRegistry.dispose();
  }

  // Private methods

  private async performHealthCheck(url: string, options: { timeout: number }): Promise<boolean> {
    try {
      const fetch = await this.getFetch();
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': '@firesite/service-registry-firebase',
        },
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  private async getFetch(): Promise<typeof fetch> {
    if (typeof globalThis.fetch !== 'undefined') {
      return globalThis.fetch;
    }

    try {
      const { default: fetch } = await import('node-fetch');
      return fetch as any;
    } catch (error) {
      throw new Error('fetch is not available. Please install node-fetch or use Node.js 18+');
    }
  }

  private startHealthUpdates(serviceName: string, healthUrl?: string, port?: number): void {
    if (!healthUrl || !port) return;

    const updateHealth = async () => {
      try {
        const healthCheckUrl = `http://localhost:${port}${healthUrl}`;
        const isHealthy = await this.performHealthCheck(healthCheckUrl, { timeout: 5000 });
        
        if (this.servicesRef) {
          await this.servicesRef.child(serviceName).update({
            isHealthy,
            lastHealthCheck: new Date().toISOString(),
          });
        }
      } catch (error) {
        // Silent fail for health updates
      }
    };

    // Update health every 30 seconds
    const healthInterval = setInterval(updateHealth, 30000);
    
    // Clean up on process exit
    process.on('exit', () => clearInterval(healthInterval));
    process.on('SIGINT', () => clearInterval(healthInterval));
    process.on('SIGTERM', () => clearInterval(healthInterval));
  }
}