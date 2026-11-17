import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import appIdentity from '../apps/mobile/config/app-identity.js';

// Credential management and submission need the production identity and
// entitlements, but no backend settings. Use a separate, ignored workspace.
// Actual builds still use apps/mobile/app.config.js and its production guards.
const root = fileURLToPath(new URL('../', import.meta.url));
const base = JSON.parse(
  await readFile(path.join(root, 'apps/mobile/app.json'), 'utf8'),
);
const expo = appIdentity({
  config: base.expo,
  environment: 'production',
  releaseScope: 'core',
});
const workspace = path.join(root, 'tmp/ios-signing');
await mkdir(workspace, { recursive: true });
const mobile = JSON.parse(
  await readFile(path.join(root, 'apps/mobile/package.json'), 'utf8'),
);
const mobileEas = JSON.parse(
  await readFile(path.join(root, 'apps/mobile/eas.json'), 'utf8'),
);
await writeFile(
  path.join(workspace, 'package.json'),
  JSON.stringify(
    {
      name: 'meal-planner-signing',
      private: true,
      version: mobile.version,
      dependencies: { expo: mobile.dependencies.expo },
    },
    null,
    2,
  ) + '\n',
);
await writeFile(
  path.join(workspace, 'app.json'),
  JSON.stringify({ expo }, null, 2) + '\n',
);
await writeFile(
  path.join(workspace, 'eas.json'),
  JSON.stringify(
    {
      cli: { version: '>= 21.0.0', appVersionSource: 'remote' },
      build: {
        production: { distribution: 'store', credentialsSource: 'remote' },
      },
      submit: mobileEas.submit,
    },
    null,
    2,
  ) + '\n',
);
console.log(`Signing project: @${expo.owner}/${expo.slug}`);
console.log(`Production bundle ID: ${expo.ios.bundleIdentifier}`);
if (process.argv.includes('--prepare-only')) {
  console.log(`Prepared signing workspace: ${workspace}`);
} else {
  const child = spawn(
    process.platform === 'win32' ? 'eas.cmd' : 'eas',
    process.argv.includes('--submit')
      ? ['submit', '--platform', 'ios', '--profile', 'production']
      : ['credentials', '--platform', 'ios'],
    { cwd: workspace, stdio: 'inherit', shell: process.platform === 'win32' },
  );
  child.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}
