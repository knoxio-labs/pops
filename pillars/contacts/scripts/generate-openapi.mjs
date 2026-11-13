import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import { format } from 'oxfmt';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * Generate the canonical Contacts artifact using the repository's formatter.
 * Rust remains the only schema producer; formatter failure or a changed JSON
 * value leaves the existing artifact untouched. The live server needs no Node.
 *
 * @param {{ repoRoot?: string, emit?: (root: string) => string | Promise<string>, formatDocument?: typeof format }} [options]
 */
export async function generateContactsOpenApi({
  repoRoot = repositoryRoot,
  emit = emitOpenApi,
  formatDocument = format,
} = {}) {
  const output = join(repoRoot, 'pillars/contacts/openapi/contacts.openapi.json');
  const source = await emit(repoRoot);
  const original = JSON.parse(source);
  const config = JSON.parse(await readFile(join(repoRoot, '.oxfmtrc.json'), 'utf8'));
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Repository formatter configuration must be an object.');
  }
  if ('overrides' in config) {
    throw new Error('Contacts generation must resolve formatter overrides before emission.');
  }
  const options = Object.fromEntries(
    Object.entries(config).filter(([key]) => key !== '$schema' && key !== 'ignorePatterns')
  );
  const formatted = await formatDocument(output, source, options);
  if (formatted.errors.length > 0) {
    throw new Error('Contacts OpenAPI formatting failed.');
  }
  if (!isDeepStrictEqual(original, JSON.parse(formatted.code))) {
    throw new Error('Contacts OpenAPI formatting changed the schema value.');
  }
  await mkdir(dirname(output), { recursive: true });
  const temporary = join(dirname(output), `.contacts-openapi-${randomUUID()}.tmp`);
  try {
    const file = await open(temporary, 'wx');
    try {
      await file.writeFile(formatted.code, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true });
  }
  return output;
}

/** @param {string} repoRoot */
function emitOpenApi(repoRoot) {
  return execFileSync('cargo', ['run', '--quiet', '-p', 'contacts', '--bin', 'emit-openapi'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateContactsOpenApi();
}
