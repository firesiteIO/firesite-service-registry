# Firebase Setup Guide - Firesite Alpha Integration

## Overview

The Firesite Service Registry now integrates with **Firesite Alpha (firesitetest)** project for real-time service discovery and presence detection during development. This setup uses Firebase Realtime Database for event-driven service management.

## Project Details

- **Project ID**: `firesitetest`
- **Database URL**: `https://firesitetest-default-rtdb.firebaseio.com`
- **Purpose**: Development and pre-production testing
- **Security**: Open for development (restricted by project-level security if needed)

## Quick Setup

### 1. Run Setup Script

```bash
cd /path/to/firesite-service-registry
node setup-firebase.js
```

This creates:
- Global config at `~/.firesite/config.json`
- Project config at `.firesite-config.json`
- Database rules template
- Environment variable template

### 2. Set Environment Variables

Add to your shell profile (`.bashrc`, `.zshrc`, etc.):

```bash
# Enable Firebase mode
export FIRESITE_USE_FIREBASE=true

# Firebase project (Firesite Alpha)
export FIREBASE_PROJECT_ID=firesitetest
export FIREBASE_DATABASE_URL=https://firesitetest-default-rtdb.firebaseio.com
```

### 3. Install Firebase Admin SDK

```bash
npm install firebase-admin
```

### 4. Configure Database Rules

Go to [Firebase Console](https://console.firebase.google.com/project/firesitetest/database/firesitetest-default-rtdb/rules) and set:

```json
{
  "rules": {
    "firesite-dev": {
      ".read": true,
      ".write": true,
      "services": {
        "$service": {
          ".validate": "newData.hasChildren(['name', 'port', 'status', 'startedAt'])"
        }
      },
      "presence": {
        "$service": {
          ".validate": "newData.hasChildren(['online', 'lastSeen'])"
        }
      }
    }
  }
}
```

## Configuration Options

### Global Configuration (`~/.firesite/config.json`)

```json
{
  "firebase": {
    "projectId": "firesitetest",
    "databaseURL": "https://firesitetest-default-rtdb.firebaseio.com",
    "apiKey": "AIzaSyAE7oFyreBMSYk5oQc_AA-SLILyck2bWXI",
    "authDomain": "firesitetest.firebaseapp.com",
    "storageBucket": "firesitetest.appspot.com",
    "messagingSenderId": "1043591405738",
    "appId": "1:1043591405738:web:b199a8743a40d25db4b0d3"
  },
  "registry": {
    "defaultMode": "firebase",
    "fallbackToFile": true,
    "rtdbPath": "firesite-dev/services",
    "presencePath": "firesite-dev/presence",
    "healthCheckInterval": 30000,
    "cleanupInterval": 60000
  },
  "development": {
    "autoCleanup": true,
    "verboseLogging": false,
    "gracePeriod": 30000
  }
}
```

### Environment Variables (Optional)

For advanced authentication or custom configuration:

```bash
# Service Account (if available)
export FIREBASE_PRIVATE_KEY_ID="your-key-id"
export FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
export FIREBASE_CLIENT_EMAIL="firebase-adminsdk@firesitetest.iam.gserviceaccount.com"
export FIREBASE_CLIENT_ID="your-client-id"

# Development flags
export FIRESITE_DEV_MODE=true
export FIRESITE_VERBOSE_LOGGING=false
```

## Usage

### Enable Firebase Mode

```javascript
// Method 1: Environment variable
process.env.FIRESITE_USE_FIREBASE = 'true';

// Method 2: Configuration
import { ServiceRegistry } from '@firesite/service-registry';
const registry = new ServiceRegistry({ useFirebase: true });
```

### Service Registration

```javascript
import { ServiceRegistry } from '@firesite/service-registry';

const registry = new ServiceRegistry({ useFirebase: true });

// Register service with real-time presence
await registry.register('my-service', {
  port: 3000,
  pid: process.pid,
  healthUrl: '/health'
});

// Automatic cleanup and presence detection
process.on('SIGINT', async () => {
  await registry.unregister('my-service');
  process.exit(0);
});
```

### CLI Integration

```bash
# Enable Firebase mode for CLI
export FIRESITE_USE_FIREBASE=true

# Check service status (with real-time data)
firesite status

# Services will show real-time status from Firebase
```

## Database Structure

Firebase Realtime Database structure:

```
firesitetest-default-rtdb/
└── firesite-dev/
    ├── services/
    │   ├── mcp-basic/
    │   │   ├── name: "mcp-basic"
    │   │   ├── port: 3001
    │   │   ├── pid: 12345
    │   │   ├── status: "running"
    │   │   ├── startedAt: "2025-07-29T19:30:00Z"
    │   │   ├── healthUrl: "/health"
    │   │   ├── healthCheckUrl: "http://localhost:3001/health"
    │   │   ├── lastHealthCheck: "2025-07-29T19:35:00Z"
    │   │   ├── isHealthy: true
    │   │   └── metadata/
    │   │       ├── hostname: "MacBook-Pro"
    │   │       ├── nodeVersion: "v18.18.0"
    │   │       └── platform: "darwin"
    │   └── chat-service/
    │       └── [similar structure]
    └── presence/
        ├── mcp-basic/
        │   ├── online: true
        │   ├── lastSeen: "2025-07-29T19:35:30Z"
        │   └── pid: 12345
        └── chat-service/
            └── [similar structure]
```

## Features

### Real-time Presence Detection
- Services automatically register as "online" when they start
- Presence is removed when services disconnect or crash
- No polling needed - instant updates

### Automatic Health Monitoring
- Health checks run every 30 seconds
- Results stored in real-time database
- Failed health checks trigger service removal

### Enhanced Metadata
- Hostname, platform, Node.js version tracking
- Service startup time and health history
- Custom metadata support

### Graceful Fallback
- Falls back to file-based registry if Firebase unavailable
- No disruption to existing workflows
- Transparent switching between modes

## Troubleshooting

### Firebase Connection Issues

1. **Check project access**:
   ```bash
   curl -X GET "https://firesitetest-default-rtdb.firebaseio.com/.json"
   ```

2. **Verify environment variables**:
   ```bash
   echo $FIRESITE_USE_FIREBASE
   echo $FIREBASE_DATABASE_URL
   ```

3. **Test admin SDK**:
   ```bash
   node -e "console.log(require('firebase-admin'))"
   ```

### Permission Errors

If you get permission errors:

1. **Check database rules** in Firebase Console
2. **Verify project ID** matches "firesitetest"
3. **Ensure path** is "firesite-dev" not "firesite"

### Service Not Appearing

1. **Check registration errors** in service logs
2. **Verify health endpoint** returns JSON
3. **Test database write** manually:
   ```bash
   curl -X PUT "https://firesitetest-default-rtdb.firebaseio.com/firesite-dev/test.json" -d '{"test": true}'
   ```

### Fallback to File Mode

If Firebase fails, the system automatically falls back to file-based registry:

```
Firebase Service Registry initialized successfully (firesitetest)
```

vs.

```
Failed to initialize Firebase, falling back to file-based registry: [error]
```

## Security Considerations

### Development Environment
- **Open rules** for development convenience
- **No sensitive data** in service metadata
- **Local network only** - services run on localhost

### Production Considerations
- **Do not use** for production services
- **firesitetest project** is for development only
- **Service account** recommended for CI/CD

## Testing the Setup

### 1. Test Firebase Connection
```bash
node -e "
const admin = require('firebase-admin');
admin.initializeApp({
  databaseURL: 'https://firesitetest-default-rtdb.firebaseio.com'
});
admin.database().ref('firesite-dev/test').set({test: true})
  .then(() => console.log('✅ Firebase connection works'))
  .catch(err => console.error('❌ Firebase error:', err));
"
```

### 2. Test Service Registration
```bash
cd /path/to/firesite-service-registry
FIRESITE_USE_FIREBASE=true node -e "
const { ServiceRegistry } = require('./dist/index.js');
const registry = new ServiceRegistry({ useFirebase: true });
registry.register('test-service', {
  port: 9999,
  pid: process.pid,
  healthUrl: '/test'
}).then(() => console.log('✅ Service registered'))
  .catch(err => console.error('❌ Registration error:', err));
"
```

### 3. Test CLI Integration
```bash
export FIRESITE_USE_FIREBASE=true
firesite status
```

## Migration from File-based Registry

Existing services using file-based registry will continue working. To migrate:

1. **Set environment variable**: `export FIRESITE_USE_FIREBASE=true`
2. **Install firebase-admin**: `npm install firebase-admin`
3. **Restart services** - they'll automatically use Firebase mode

No code changes required - the system detects the mode automatically.

## Database Rules Template

For Firebase Console (copy and paste):

```json
{
  "rules": {
    "firesite-dev": {
      ".read": true,
      ".write": true,
      "services": {
        "$service": {
          ".validate": "newData.hasChildren(['name', 'port', 'status', 'startedAt'])"
        }
      },
      "presence": {
        "$service": {
          ".validate": "newData.hasChildren(['online', 'lastSeen'])"
        }
      }
    }
  }
}
```

## Support

For issues with Firebase integration:

1. Check [Firebase Console](https://console.firebase.google.com/project/firesitetest)
2. Verify database rules and permissions
3. Test connection with curl commands above
4. Fall back to file mode if needed: `unset FIRESITE_USE_FIREBASE`