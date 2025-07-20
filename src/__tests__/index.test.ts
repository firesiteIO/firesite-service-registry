/**
 * Basic tests for @firesite/service-registry
 * These tests ensure the package can be imported and basic functionality works
 */

import { describe, it, expect } from 'vitest';
import { ServiceRegistry, VERSION, PACKAGE_INFO } from '../index.js';
import { ServiceRegistryError, ServiceNotFoundError } from '../types/index.js';

describe('@firesite/service-registry', () => {
  describe('Package exports', () => {
    it('should export ServiceRegistry class', () => {
      expect(ServiceRegistry).toBeDefined();
      expect(typeof ServiceRegistry).toBe('function');
    });

    it('should export VERSION constant', () => {
      expect(VERSION).toBeDefined();
      expect(typeof VERSION).toBe('string');
      expect(VERSION).toBe('0.1.0');
    });

    it('should export PACKAGE_INFO constant', () => {
      expect(PACKAGE_INFO).toBeDefined();
      expect(typeof PACKAGE_INFO).toBe('object');
      expect(PACKAGE_INFO.name).toBe('@firesite/service-registry');
      expect(PACKAGE_INFO.version).toBe('0.1.0');
    });

    it('should export error classes', () => {
      expect(ServiceRegistryError).toBeDefined();
      expect(ServiceNotFoundError).toBeDefined();
      expect(typeof ServiceRegistryError).toBe('function');
      expect(typeof ServiceNotFoundError).toBe('function');
    });
  });

  describe('ServiceRegistry instantiation', () => {
    it('should create ServiceRegistry instance', () => {
      const registry = new ServiceRegistry();
      expect(registry).toBeInstanceOf(ServiceRegistry);
    });

    it('should detect environment', () => {
      const registry = new ServiceRegistry();
      const env = registry.getEnvironment();
      expect(env).toBeDefined();
      expect(['node', 'browser']).toContain(env);
    });

    it('should create instance with static factory method', () => {
      const registry = ServiceRegistry.create();
      expect(registry).toBeInstanceOf(ServiceRegistry);
    });
  });

  describe('Error classes', () => {
    it('should create ServiceRegistryError with correct properties', () => {
      const error = new ServiceRegistryError('Test message', 'TEST_CODE', { detail: 'test' });
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ServiceRegistryError);
      expect(error.message).toBe('Test message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.details).toEqual({ detail: 'test' });
      expect(error.name).toBe('ServiceRegistryError');
    });

    it('should create ServiceNotFoundError with correct properties', () => {
      const error = new ServiceNotFoundError('test-service');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ServiceRegistryError);
      expect(error).toBeInstanceOf(ServiceNotFoundError);
      expect(error.message).toBe("Service 'test-service' not found in registry");
      expect(error.code).toBe('SERVICE_NOT_FOUND');
      expect(error.details).toEqual({ serviceName: 'test-service' });
    });
  });

  describe('Static convenience methods', () => {
    it('should provide getEnvironment static method', () => {
      const env = ServiceRegistry.getEnvironment();
      expect(env).toBeDefined();
      expect(['node', 'browser']).toContain(env);
    });
  });
});