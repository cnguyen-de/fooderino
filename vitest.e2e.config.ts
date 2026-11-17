import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/** End-to-end against a local Supabase. Run through `pnpm test:e2e`, never by `pnpm test`. */
export default defineConfig({
  resolve: {
    alias: {
      '~~': fileURLToPath(new URL('./', import.meta.url)),
      '~': fileURLToPath(new URL('./app', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.e2e.ts'],
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false
  }
});
