#!/usr/bin/env node

/**
 * Setup script for Firesite Service Registry Firebase integration
 * Configures the Firesite Alpha (firesitetest) project for development use
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIRESITE_CONFIG = {
  firebase: {
    projectId: "firesitetest",
    databaseURL: "https://firesitetest-default-rtdb.firebaseio.com",
    apiKey: "AIzaSyAE7oFyreBMSYk5oQc_AA-SLILyck2bWXI",
    authDomain: "firesitetest.firebaseapp.com",
    storageBucket: "firesitetest.appspot.com",
    messagingSenderId: "1043591405738",
    appId: "1:1043591405738:web:b199a8743a40d25db4b0d3"
  },
  registry: {
    defaultMode: "firebase",
    fallbackToFile: true,
    rtdbPath: "firesite-dev/services",
    presencePath: "firesite-dev/presence",
    healthCheckInterval: 30000,
    cleanupInterval: 60000
  },
  development: {
    autoCleanup: true,
    verboseLogging: false,
    gracePeriod: 30000
  }
};

const DATABASE_RULES = {
  rules: {
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
};

async function ensureDirectoryExists(dirPath) {
  try {
    await fs.access(dirPath);
  } catch (error) {
    await fs.mkdir(dirPath, { recursive: true });
    console.log(`✅ Created directory: ${dirPath}`);
  }
}

async function writeConfigFile(filePath, config) {
  try {
    await fs.writeFile(filePath, JSON.stringify(config, null, 2));
    console.log(`✅ Created config file: ${filePath}`);
  } catch (error) {
    console.error(`❌ Failed to create ${filePath}:`, error.message);
  }
}

async function main() {
  console.log('🔥 Setting up Firesite Service Registry with Firebase integration...\n');

  // 1. Create .firesite directory
  const firesiteDir = join(homedir(), '.firesite');
  await ensureDirectoryExists(firesiteDir);

  // 2. Create global config
  const globalConfigPath = join(firesiteDir, 'config.json');
  await writeConfigFile(globalConfigPath, FIRESITE_CONFIG);

  // 3. Create project-level config
  const projectConfigPath = join(__dirname, '.firesite-config.json');
  await writeConfigFile(projectConfigPath, FIRESITE_CONFIG);

  // 4. Create database rules file
  const rulesPath = join(__dirname, 'firebase-database-rules.json');
  await writeConfigFile(rulesPath, DATABASE_RULES);

  // 5. Create environment template
  const envTemplate = `# Firesite Service Registry - Firebase Configuration
# Copy these to your shell profile or .env file

# Enable Firebase mode for service registry
export FIRESITE_USE_FIREBASE=true

# Firebase project configuration (Firesite Alpha - firesitetest)
export FIREBASE_PROJECT_ID=firesitetest
export FIREBASE_DATABASE_URL=https://firesitetest-default-rtdb.firebaseio.com

# Optional: Firebase Admin SDK credentials (if you have a service account)
# export FIREBASE_PRIVATE_KEY_ID=your-private-key-id
# export FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"
# export FIREBASE_CLIENT_EMAIL=firebase-adminsdk@firesitetest.iam.gserviceaccount.com
# export FIREBASE_CLIENT_ID=your-client-id

# Development settings
export FIRESITE_DEV_MODE=true
export FIRESITE_VERBOSE_LOGGING=false
`;

  const envPath = join(__dirname, '.env.template');
  await fs.writeFile(envPath, envTemplate);
  console.log(`✅ Created environment template: ${envPath}`);

  console.log('\n🎉 Setup complete! Next steps:\n');
  console.log('1. Copy environment variables from .env.template to your shell profile');
  console.log('2. Ensure Firebase Realtime Database rules allow development access:');
  console.log('   - Go to https://console.firebase.google.com/project/firesitetest/database/firesitetest-default-rtdb/rules');
  console.log('   - Use the rules from firebase-database-rules.json');
  console.log('3. Install firebase-admin if using Firebase mode:');
  console.log('   npm install firebase-admin');
  console.log('4. Test the integration:');
  console.log('   FIRESITE_USE_FIREBASE=true firesite status');
  console.log('\n📖 For more details, see FIREBASE_SETUP.md\n');
}

main().catch(console.error);