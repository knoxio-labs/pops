import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildCommandVectors, COMMAND_VECTOR_CASES } from '../command-vectors.js';
import { COMMAND_REGISTRY } from '../registry.js';

const CONTRACTS_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'contracts',
  'command-vectors-v1.json'
);

describe('command vectors', () => {
  it('covers every registered op with at least one vector', () => {
    const covered = new Set(COMMAND_VECTOR_CASES.map((vectorCase) => vectorCase.op));
    for (const op of COMMAND_REGISTRY.keys()) {
      expect(covered.has(op), `no vector case for ${op}`).toBe(true);
    }
  });

  it('every vector applied (no case in this fixture set is a conflict or rejection)', () => {
    for (const vector of buildCommandVectors()) {
      expect(vector.outcome.status, `${vector.name} was ${vector.outcome.status}`).toBe('applied');
    }
  });

  it('regenerates byte-for-byte the same output on every run', () => {
    const first = JSON.stringify(buildCommandVectors());
    const second = JSON.stringify(buildCommandVectors());
    expect(second).toBe(first);
  });

  it('matches the committed contracts/command-vectors-v1.json exactly (drift)', () => {
    // Parsed, not raw text: `generate-command-vectors.ts` runs the committed
    // file through oxfmt as its last step, so this compares data, leaving
    // whitespace to `oxfmt --check`.
    const committed: unknown = JSON.parse(readFileSync(CONTRACTS_PATH, 'utf8'));
    const regenerated: unknown = JSON.parse(
      JSON.stringify({ version: 1, vectors: buildCommandVectors() })
    );
    expect(regenerated).toEqual(committed);
  });
});
