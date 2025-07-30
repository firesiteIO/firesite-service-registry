# @firesite/service-registry

A centralized service registry for the Firesite ecosystem, enabling dynamic service discovery and port orchestration across all Firesite projects.

## Overview

The Firesite Service Registry provides a unified solution for service registration, discovery, and health monitoring across the Firesite ecosystem. It supports both Node.js and browser environments with automatic environment detection.

## Features

### Core Registry Capabilities
- **Dual Environment Support**: Works seamlessly in both Node.js (file-based) and browser (HTTP API-based) environments
- **Dynamic Port Discovery**: Services can discover each other's ports at runtime
- **Health Monitoring**: Built-in health check capabilities for all registered services
- **Automatic Cleanup**: Stale services are automatically removed from the registry
- **TypeScript Support**: Full type definitions for better developer experience
- **Zero Configuration**: Works out of the box with sensible defaults
- **Retry Logic**: Built-in retry mechanisms for resilient service discovery

### 🔥 Firebase Realtime Database Integration (NEW)
- **Event-Driven Architecture**: Real-time service registration and discovery using Firebase RTDB
- **Multi-User Isolation**: User-specific service namespacing (`firesite-dev/users/{userId}/services`)
- **Intelligent User ID Generation**: Git email → system username → unique ID fallback chain
- **Real-Time Presence Detection**: Automatic service cleanup on disconnect using Firebase presence
- **Graceful Fallback**: Seamless fallback to file-based registry when Firebase unavailable
- **Enhanced Service Metadata**: Rich service information including capabilities and user context

### Enhanced CLI Integration
- **Professional Status Display**: Beautiful service status tables with comprehensive information
- **Health Check Integration**: Enhanced health verification using both PID and HTTP health checks
- **Process Management**: Proper PID tracking and process lifecycle management
- **Cross-Project Compatibility**: Works across all Firesite ecosystem projects

## Installation

```bash
npm install @firesite/service-registry
```

> **Note**: Package is now live on NPM with automated CI/CD! 🎉

Or with yarn:

```bash
yarn add @firesite/service-registry
```

## Quick Start

### Node.js Environment

```javascript
import { ServiceRegistry } from '@firesite/service-registry';

// Register a service
await ServiceRegistry.register('my-service', {
  port: 3000,
  pid: process.pid,
  healthUrl: '/health'
});

// Discover a service
const service = await ServiceRegistry.discover('another-service');
console.log(`Service running on port ${service.port}`);

// Check service health
const isHealthy = await ServiceRegistry.checkHealth('another-service');
```

### Browser Environment

```javascript
import { ServiceRegistry } from '@firesite/service-registry';

// Configure the registry API endpoint (optional)
ServiceRegistry.configure({
  registryApiUrl: 'http://localhost:3001/api/registry'
});

// Discover a service
const service = await ServiceRegistry.discover('mcp-basic');
console.log(`Service running on port ${service.port}`);
```

## API Reference

### `ServiceRegistry.register(name, options)`

Register a service with the registry.

**Parameters:**
- `name` (string): Unique service identifier
- `options` (object):
  - `port` (number): Port number the service is running on
  - `pid` (number): Process ID (Node.js only)
  - `healthUrl` (string): Health check endpoint path
  - `metadata` (object): Additional service metadata

**Returns:** Promise<void>

### `ServiceRegistry.discover(name)`

Discover a registered service by name.

**Parameters:**
- `name` (string): Service identifier to discover

**Returns:** Promise<ServiceInfo | null>

### `ServiceRegistry.unregister(name)`

Remove a service from the registry.

**Parameters:**
- `name` (string): Service identifier to unregister

**Returns:** Promise<void>

### `ServiceRegistry.checkHealth(name)`

Check if a service is healthy.

**Parameters:**
- `name` (string): Service identifier to check

**Returns:** Promise<boolean>

### `ServiceRegistry.listServices()`

Get all registered services.

**Returns:** Promise<ServiceInfo[]>

### `ServiceRegistry.configure(options)`

Configure the registry behavior.

**Parameters:**
- `options` (object):
  - `registryPath` (string): Custom registry file path (Node.js only)
  - `registryApiUrl` (string): Registry API endpoint (browser only)
  - `healthCheckTimeout` (number): Health check timeout in ms
  - `retryAttempts` (number): Number of retry attempts
  - `retryDelay` (number): Delay between retries in ms

## Advanced Usage

### Custom Registry Path (Node.js)

```javascript
ServiceRegistry.configure({
  registryPath: '/custom/path/registry.json'
});
```

### Health Check with Retry

```javascript
const isHealthy = await ServiceRegistry.checkHealth('my-service', {
  retries: 5,
  timeout: 10000
});
```

### Service Metadata

```javascript
await ServiceRegistry.register('my-service', {
  port: 3000,
  pid: process.pid,
  healthUrl: '/health',
  metadata: {
    version: '1.0.0',
    capabilities: ['auth', 'storage'],
    environment: 'development'
  }
});
```

## Integration Examples

### Express Server

```javascript
import express from 'express';
import { ServiceRegistry } from '@firesite/service-registry';

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, async () => {
  await ServiceRegistry.register('my-api', {
    port: PORT,
    pid: process.pid,
    healthUrl: '/health'
  });
  console.log(`Service registered on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await ServiceRegistry.unregister('my-api');
  process.exit(0);
});
```

### React Application

```javascript
import { useEffect, useState } from 'react';
import { ServiceRegistry } from '@firesite/service-registry';

function useServiceDiscovery(serviceName) {
  const [service, setService] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ServiceRegistry.discover(serviceName)
      .then(setService)
      .finally(() => setLoading(false));
  }, [serviceName]);

  return { service, loading };
}

// Usage
function MyComponent() {
  const { service, loading } = useServiceDiscovery('mcp-basic');
  
  if (loading) return <div>Discovering service...</div>;
  if (!service) return <div>Service not found</div>;
  
  return <div>Service running on port {service.port}</div>;
}
```

## Migration Guide

If you're migrating from inline service-registry implementations:

1. Install the package: `npm install @firesite/service-registry`
2. Replace local imports:
   ```javascript
   // Before
   import { registerService } from '../utils/service-registry.js';
   
   // After
   import { ServiceRegistry } from '@firesite/service-registry';
   ```
3. Update method calls:
   ```javascript
   // Before
   registerService('my-service', 3000, process.pid, '/health');
   
   // After
   await ServiceRegistry.register('my-service', {
     port: 3000,
     pid: process.pid,
     healthUrl: '/health'
   });
   ```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- Documentation: [https://docs.firesite.io/service-registry](https://docs.firesite.io/service-registry)
- Issues: [GitHub Issues](https://github.com/firesiteIO/firesite-service-registry/issues)
- Discussions: [GitHub Discussions](https://github.com/firesiteIO/firesite-service-registry/discussions)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a list of changes in each release.
