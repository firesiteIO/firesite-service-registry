#!/usr/bin/env node

/**
 * Manual registration demo to prove the enhanced CLI system works
 * This registers the currently running services that have proper health endpoints
 */

console.log('🔧 Manual Service Registration Demo\n');

async function registerRunningServices() {
  try {
    // Import our service registry
    const { ServiceRegistry } = await import('./dist/index.esm.js');
    const registry = new ServiceRegistry();
    
    // Register services that have proper JSON health endpoints
    const services = [
      {
        name: 'mcp-basic',
        port: 3001,
        healthUrl: '/health'
      },
      {
        name: 'mcp-max', 
        port: 3002,
        healthUrl: '/health'
      }
    ];
    
    console.log('Registering services with proper health endpoints...\n');
    
    for (const service of services) {
      try {
        await registry.register(service.name, {
          port: service.port,
          pid: 99999, // Fake PID for demo - normally services provide process.pid
          healthUrl: service.healthUrl
        });
        
        console.log(`✅ Registered: ${service.name} on port ${service.port}`);
      } catch (error) {
        console.log(`❌ Failed to register ${service.name}: ${error.message}`);
      }
    }
    
    console.log('\n🎯 Now run "firesite status" to see the registered services!');
    console.log('\nExpected result:');
    console.log('- mcp-basic: ● Running, ✓ Healthy');
    console.log('- mcp-max: ● Running, ✓ Healthy');
    
  } catch (error) {
    console.error('❌ Demo failed:', error.message);
  }
}

registerRunningServices();