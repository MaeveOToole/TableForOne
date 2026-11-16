import { defineConfig } from '@playwright/test';
import base from './playwright.config';

const webServer = base.webServer;
if (!webServer || Array.isArray(webServer)) {
  throw new Error('Core browser checks require one configured preview server.');
}

export default defineConfig({
  ...base,
  metadata: { releaseScope: 'core' },
  use: { ...base.use, baseURL: 'http://127.0.0.1:18092' },
  outputDir: 'output/browser-tests-core',
  webServer: {
    ...webServer,
    command: 'node ../../node_modules/expo/bin/cli start --web --port 18092',
    url: 'http://127.0.0.1:18092',
    env: {
      ...webServer.env,
      EXPO_PUBLIC_RELEASE_SCOPE: 'core',
    },
  },
});
