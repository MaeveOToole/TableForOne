import { readFile, writeFile } from 'node:fs/promises';
import { format } from 'prettier';
import { openApiDocument } from '../src/openapi.js';

const target = new URL('../../../docs/openapi.json', import.meta.url);
const content = await format(JSON.stringify(openApiDocument), {
  parser: 'json',
});
if (process.argv.includes('--write')) {
  await writeFile(target, content);
  console.log('Updated docs/openapi.json');
} else {
  if ((await readFile(target, 'utf8')) !== content)
    throw new Error(
      'API specification is stale. Run npm run spec:write -w @meal/api.',
    );
  console.log('API specification matches the shared contracts.');
}
