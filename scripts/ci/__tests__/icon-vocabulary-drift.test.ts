/**
 * The Action Icon Standards banned-icon vocabulary is hardcoded three
 * times — libs/ui/README.md's table, .oxlintrc.json's no-restricted-imports
 * entries, and icon-vocabulary-lint.test.ts's cases. These drive the pure
 * parsers over synthetic drifted fixtures, so a real drift between the three
 * sources is caught here rather than by someone noticing the README is
 * lying.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, inject, it } from 'vitest';

import {
  parseOxlintBannedNames,
  parseReadmeBannedNames,
  parseTestBannedNames,
} from '../check-icon-vocabulary-drift.mjs';
import { passingProofStdout } from './real-tree-proofs.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

const README_TABLE = `## Action Icon Standards

**Lucide React** is the only icon library.

| Action          | Icon                              | Banned alternatives |
| --------------- | ---------------------------------- | -------------------- |
| Add / Create    | \`Plus\`                            |                     |
| Edit            | \`Pencil\`                          | \`Edit2\`, \`PenLine\`  |
| Delete / Remove | \`Trash2\`                          | \`Trash\`             |

One icon per action, no aliases.
`;

const OXLINTRC = JSON.stringify({
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          { name: 'lucide-react', importNames: ['Edit2', 'PenLine'] },
          { name: 'lucide-react', importNames: ['Trash'] },
          { name: 'other-package', importNames: ['ShouldNotCount'] },
        ],
      },
    ],
  },
});

const TEST_SOURCE = `
describe('banned icon imports are reported', () => {
  const cases: Array<[banned: string, canonical: string]> = [
    ['Edit2', 'Pencil'],
    ['PenLine', 'Pencil'],
    ['Trash', 'Trash2'],
  ];
});
`;

describe('parseReadmeBannedNames', () => {
  it('collects every banned name from the Banned alternatives column', () => {
    expect(parseReadmeBannedNames(README_TABLE)).toEqual(new Set(['Edit2', 'PenLine', 'Trash']));
  });

  it('ignores rows with an empty Banned alternatives cell', () => {
    expect(parseReadmeBannedNames(README_TABLE).has('Plus')).toBe(false);
  });

  it('returns an empty set when the section heading is missing', () => {
    expect(parseReadmeBannedNames('# Some other doc\n\nno table here\n')).toEqual(new Set());
  });
});

describe('parseOxlintBannedNames', () => {
  it('collects every importName banned for lucide-react', () => {
    expect(parseOxlintBannedNames(OXLINTRC)).toEqual(new Set(['Edit2', 'PenLine', 'Trash']));
  });

  it('ignores restrictions on an unrelated package', () => {
    expect(parseOxlintBannedNames(OXLINTRC).has('ShouldNotCount')).toBe(false);
  });
});

describe('parseTestBannedNames', () => {
  it('collects the first element of every [banned, canonical] tuple', () => {
    expect(parseTestBannedNames(TEST_SOURCE)).toEqual(new Set(['Edit2', 'PenLine', 'Trash']));
  });
});

describe('the three sources agree on a drift', () => {
  it('detects a name banned in the README but missing from .oxlintrc.json', () => {
    const readmeNames = parseReadmeBannedNames(README_TABLE);
    const driftedOxlintNames = parseOxlintBannedNames(
      JSON.stringify({
        rules: {
          'no-restricted-imports': [
            'error',
            { paths: [{ name: 'lucide-react', importNames: ['Edit2'] }] },
          ],
        },
      })
    );
    const missing = [...readmeNames].filter((name) => !driftedOxlintNames.has(name));
    expect(missing).toEqual(['PenLine', 'Trash']);
  });

  it('detects a name banned in .oxlintrc.json but missing from the README', () => {
    const oxlintNames = parseOxlintBannedNames(OXLINTRC);
    const driftedReadmeNames = parseReadmeBannedNames(
      README_TABLE.replace('`Edit2`, `PenLine`', '`PenLine`')
    );
    const missing = [...oxlintNames].filter((name) => !driftedReadmeNames.has(name));
    expect(missing).toEqual(['Edit2']);
  });
});

describe('the guard proves itself', () => {
  it('passes its own --self-test', () => {
    const output = passingProofStdout(inject('realTreeProofs'), 'icon-vocabulary-drift:self-test');
    expect(output).toMatch(/self-test OK/u);
  });
});

describe('the guard passes on the real tree', () => {
  it('the real README, .oxlintrc.json, and test file agree', async () => {
    const readme = readFileSync(join(repoRoot, 'libs/ui/README.md'), 'utf8');
    const oxlintrc = readFileSync(join(repoRoot, '.oxlintrc.json'), 'utf8');
    const testSource = readFileSync(
      join(repoRoot, 'scripts/ci/__tests__/icon-vocabulary-lint.test.ts'),
      'utf8'
    );

    const readmeNames = parseReadmeBannedNames(readme);
    const oxlintNames = parseOxlintBannedNames(oxlintrc);
    const testNames = parseTestBannedNames(testSource);

    expect(readmeNames.size).toBeGreaterThan(0);
    expect(readmeNames).toEqual(oxlintNames);
    expect(oxlintNames).toEqual(testNames);
  });
});
