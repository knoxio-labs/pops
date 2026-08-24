import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { ComposeFileSchema } from '../compose-schema.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const compose = ComposeFileSchema.parse(
  load(readFileSync(join(repoRoot, 'infra', 'docker-compose.yml'), 'utf8'))
);

describe('purchases receipt vision credential', () => {
  it('mounts the Anthropic secret at the path purchases reads', () => {
    const purchases = compose.services['purchases-api'];

    expect(purchases, 'purchases-api must be declared in infra/docker-compose.yml').toBeDefined();
    expect(purchases?.secrets).toContain('claude_api_key');
    expect(purchases?.environment?.['ANTHROPIC_API_KEY_FILE']).toBe('/run/secrets/claude_api_key');
  });
});
