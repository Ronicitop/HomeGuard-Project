import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', quiet: true });
const testDb = process.env.HG_TEST_DB || 'homeguard_b_test';
if (!testDb.endsWith('_test')) throw new Error('HG_TEST_DB must end in _test');
export default defineConfig({ test: {
  include: ['tests/**/*.test.ts'], fileParallelism: false, maxWorkers: 1,
  globalSetup: ['./tests/globalSetup.ts'],
  env: { DB_NAME: testDb, HG_DEMO_MODE: 'true', NODE_ENV: 'test' },
  testTimeout: 15000, hookTimeout: 30000,
} });
