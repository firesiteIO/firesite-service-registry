import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 10000,
    mockReset: true,
    clearMocks: true,
    restoreMocks: true
  },
  esbuild: {
    target: 'node18'
  }
});