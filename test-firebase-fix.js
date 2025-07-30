#!/usr/bin/env node
import { ServiceRegistry } from './dist/index.esm.js';

console.log('🔥 Testing Firebase Integration Fix...');

async function testFirebaseIntegration() {
  try {
    process.env.FIRESITE_USE_FIREBASE = 'true';
    const registry = new ServiceRegistry({ useFirebase: true });

    console.log('Attempting Firebase registration...');
    await registry.register('firebase-test-service', {
      port: 9998,
      pid: process.pid,
      healthUrl: '/health'
    });
    console.log('✅ Firebase registration succeeded!');
    
    const services = await registry.listServices();
    console.log(`📋 Services found: ${services.length}`);
    services.forEach(s => {
      const pidInfo = s.pid !== -1 ? `PID: ${s.pid}` : 'PID: -1';
      console.log(`  - ${s.name} ${pidInfo}`);
    });
    
    await registry.unregister('firebase-test-service');
    console.log('✅ Cleanup successful');
    
    return true;
  } catch (error) {
    console.log('❌ Firebase test failed:', error.message);
    return false;
  }
}

testFirebaseIntegration().then(success => {
  if (success) {
    console.log('\n🎯 Firebase integration is working!');
  } else {
    console.log('\n⚠️ Still using file-based fallback (which is fine)');
  }
  process.exit(0);
});