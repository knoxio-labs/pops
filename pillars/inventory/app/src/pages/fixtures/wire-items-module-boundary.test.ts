import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const fixtureDirectory = dirname(fileURLToPath(import.meta.url));

describe('wire-items module boundary', () => {
  it('keeps the source view from importing the sheet module', async () => {
    const source = await readFile(join(fixtureDirectory, 'wire-items-source.tsx'), 'utf8');

    expect(source).toContain("from './wire-items-types.js'");
    expect(source).not.toContain("from './wire-items-sheet.js'");
  });
});
