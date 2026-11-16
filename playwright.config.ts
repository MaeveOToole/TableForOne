import { defineConfig } from '@playwright/test';
import path from 'node:path';
const port = Number(process.env.PLAYWRIGHT_PORT || 8091);
export default defineConfig({
  testDir: 'tests/browser',
  timeout: 30000,
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  metadata: { releaseScope: 'extended' },
  outputDir: 'output/browser-tests',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 390, height: 780 },
    channel: process.platform === 'win32' ? 'chrome' : undefined,
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `node ../../node_modules/expo/bin/cli start --web --port ${port}`,
    cwd: path.resolve('apps/mobile'),
    url: `http://127.0.0.1:${port}`,
    timeout: 120000,
    reuseExistingServer: false,
    env: {
      CI: '1',
      EXPO_NO_TELEMETRY: '1',
      APP_ENV: 'development',
      EXPO_PUBLIC_RELEASE_SCOPE: 'extended',
      EXPO_PUBLIC_API_URL: 'http://127.0.0.1:3199',
      EXPO_PUBLIC_SUPABASE_URL: 'https://ui-test.supabase.co',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-test-key',
    },
  },
});
