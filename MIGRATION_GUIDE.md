# Service Migration Guide

This guide helps migrate existing Firesite services to use the @firesite/service-registry NPM package for proper PID tracking and health reporting.

## Overview

The migration process involves:
1. Installing the @firesite/service-registry package
2. Replacing local service-registry.js imports with the NPM package
3. Updating service registration calls to use async/await
4. Implementing proper health endpoints
5. Adding proper cleanup on service shutdown

## Step-by-Step Migration

### 1. Install the Package

```bash
npm install @firesite/service-registry
```

### 2. Replace Local Imports

**Before (using local file):**
```javascript
import { registerService, unregisterService } from './utils/service-registry.js';
```

**After (using NPM package):**
```javascript
import { ServiceRegistry } from '@firesite/service-registry';
```

### 3. Update Registration Code

**Before (synchronous):**
```javascript
app.listen(PORT, () => {
  console.log(`Service running on port ${PORT}`);
  
  // Old synchronous registration with placeholder PID
  registerService('my-service', PORT, process.pid, '/health');
});
```

**After (asynchronous with proper PID):**
```javascript
app.listen(PORT, async () => {
  console.log(`Service running on port ${PORT}`);
  
  // Register with Firesite CLI registry
  try {
    const registry = new ServiceRegistry();
    await registry.register('my-service', {
      port: PORT,
      pid: process.pid, // Actual process PID
      healthUrl: '/health'
    });
    console.log('Registered with Firesite CLI registry');
  } catch (error) {
    console.warn('Failed to register with CLI registry:', error.message);
  }
});
```

### 4. Add Proper Cleanup

**Before (basic cleanup):**
```javascript
process.on('SIGINT', () => {
  unregisterService('my-service');
  process.exit(0);
});
```

**After (async cleanup):**
```javascript
// Graceful shutdown handler
async function shutdown() {
  console.log('Shutting down gracefully...');
  
  // Unregister from CLI registry
  try {
    const registry = new ServiceRegistry();
    await registry.unregister('my-service');
    console.log('Successfully unregistered from CLI registry');
  } catch (error) {
    console.error('Failed to unregister from CLI registry:', error.message);
  }
  
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

### 5. Implement Proper Health Endpoints

Each service needs a health endpoint that returns a proper JSON response:

**Express.js Example:**
```javascript
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'my-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});
```

**Firebase Functions Example:**
```javascript
// For Firebase Functions, ensure the health endpoint is at the registered path
export const health = onRequest((req, res) => {
  res.json({
    status: 'ok',
    service: 'my-service-functions',
    timestamp: new Date().toISOString()
  });
});
```

## Service-Specific Examples

### Chat Service Migration

```javascript
// src/main.js or equivalent
import { ServiceRegistry } from '@firesite/service-registry';

const PORT = process.env.PORT || 5174;

app.listen(PORT, async () => {
  console.log(`Chat service running on port ${PORT}`);
  
  try {
    const registry = new ServiceRegistry();
    await registry.register('chat-service', {
      port: PORT,
      pid: process.pid,
      healthUrl: '/health'
    });
    console.log('Chat service registered with CLI registry');
  } catch (error) {
    console.warn('Failed to register chat service:', error.message);
  }
});

// Add health endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'chat-service',
    timestamp: new Date().toISOString()
  });
});
```

### Project Service Migration

```javascript
// src/main.js or equivalent
import { ServiceRegistry } from '@firesite/service-registry';

const PORT = process.env.PORT || 5175;

app.listen(PORT, async () => {
  console.log(`Project service running on port ${PORT}`);
  
  try {
    const registry = new ServiceRegistry();
    await registry.register('project-service', {
      port: PORT,
      pid: process.pid,
      healthUrl: '/api/health' // Note: specific path for project service
    });
    console.log('Project service registered with CLI registry');
  } catch (error) {
    console.warn('Failed to register project service:', error.message);
  }
});

// Fix the health endpoint to return JSON instead of HTML
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'project-service',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});
```

### Firebase Functions Migration

For Firebase Functions, the health endpoint URL needs to match the registered path:

```javascript
// functions/index.js
import { onRequest } from 'firebase-functions/v2/https';
import { ServiceRegistry } from '@firesite/service-registry';

// Health endpoint for functions
export const health = onRequest((req, res) => {
  res.json({
    status: 'ok',
    service: 'project-service-functions',
    timestamp: new Date().toISOString()
  });
});

// Register the functions service (if using emulator)
if (process.env.FUNCTIONS_EMULATOR === 'true') {
  const PORT = 5005; // Functions emulator port
  
  setTimeout(async () => {
    try {
      const registry = new ServiceRegistry();
      await registry.register('project-service-functions', {
        port: PORT,
        pid: process.pid,
        healthUrl: '/health' // Functions endpoint
      });
      console.log('Functions service registered with CLI registry');
    } catch (error) {
      console.warn('Failed to register functions service:', error.message);
    }
  }, 2000); // Wait for emulator to start
}
```

## Firebase Realtime Database Mode

For enhanced real-time presence detection, services can use Firebase mode:

```javascript
import { ServiceRegistry } from '@firesite/service-registry';

// Enable Firebase mode
const registry = new ServiceRegistry({ useFirebase: true });

// Or set environment variable
process.env.FIRESITE_USE_FIREBASE = 'true';
```

### Firebase Setup Requirements

1. **Service Account Key**: Place in one of these locations:
   - `~/.firesite/service-account.json`
   - `./service-account.json`
   - `./firebase-service-account.json`

2. **Environment Variables**:
   ```bash
   # Option 1: Service account JSON string
   export FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
   
   # Option 2: Database URL
   export FIREBASE_DATABASE_URL='https://your-project.firebaseio.com'
   
   # Enable Firebase mode
   export FIRESITE_USE_FIREBASE=true
   ```

3. **Firebase Database Rules** (for development):
   ```json
   {
     "rules": {
       "firesite": {
         ".read": true,
         ".write": true
       }
     }
   }
   ```

## Verification Steps

After migration, verify the service is working correctly:

1. **Start your service**
2. **Run `firesite status`** - should show correct PID (not -1)
3. **Check health endpoint** - should return JSON response
4. **Stop your service** - should unregister automatically

## Troubleshooting

### Service shows PID -1
- Ensure you're using `process.pid` in registration
- Check that registration happens after server starts listening
- Verify no errors in registration try/catch block

### Health check fails
- Ensure health endpoint returns HTTP 200 status
- Check the health endpoint URL matches registration
- Test health endpoint manually: `curl http://localhost:PORT/health`

### Service doesn't unregister on shutdown
- Ensure you have proper SIGINT/SIGTERM handlers
- Check that unregister call is awaited
- Verify no errors in shutdown process

### Firebase mode not working
- Check Firebase service account configuration
- Verify database URL is correct
- Ensure Firebase Admin SDK is installed
- Check database security rules allow read/write

## Migration Checklist

For each service:

- [ ] Install `@firesite/service-registry` package
- [ ] Replace local service-registry imports
- [ ] Update registration to use async/await with correct PID
- [ ] Implement proper JSON health endpoint
- [ ] Add graceful shutdown with unregistration
- [ ] Test with `firesite status` command
- [ ] Verify health endpoint responds correctly
- [ ] Remove old `utils/service-registry.js` file

## Questions?

If you encounter issues during migration:
1. Check the console for error messages
2. Test health endpoints manually
3. Verify Firebase configuration (if using Firebase mode)
4. Review the service registry logs