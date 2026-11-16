import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
// Existing process variables take precedence over local files.
for (const path of ['../../../.env.local', '../.env.local']) {
  try {
    loadEnvFile(fileURLToPath(new URL(path, import.meta.url)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
