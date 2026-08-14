#!/usr/bin/env node
/**
 * Icon vocabulary three-way drift guard.
 *
 * The Action Icon Standards banned-icon vocabulary is hardcoded in three
 * places: `libs/ui/README.md`'s table, `.oxlintrc.json`'s
 * `no-restricted-imports` entries for `lucide-react`, and
 * `scripts/ci/__tests__/icon-vocabulary-lint.test.ts`'s test cases. The
 * README itself warns that adding a banned name in one without the others
 * lets the table and the gate drift apart — a name banned in the README but
 * not in the lint config reads as enforced when it isn't; a name the lint
 * config bans but the README omits confuses anyone reading the docs to find
 * out why their import failed.
 *
 * This guard parses all three sources independently and asserts they name
 * the exact same set of banned icons. It does not parse canonical
 * replacements — the pairing is covered by icon-vocabulary-lint.test.ts,
 * which drives the real oxlint binary and checks the reported replacement
 * in each diagnostic's `help` text.
 *
 * Usage:
 *   node scripts/ci/check-icon-vocabulary-drift.mjs
 *
 * Exit 0 when all three sources agree; non-zero otherwise.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

const README_PATH = 'libs/ui/README.md';
const OXLINTRC_PATH = '.oxlintrc.json';
const TEST_PATH = 'scripts/ci/__tests__/icon-vocabulary-lint.test.ts';

/**
 * Every banned icon name in the README's "Action Icon Standards" table's
 * "Banned alternatives" column.
 *
 * @param {string} markdown
 * @returns {Set<string>}
 */
export function parseReadmeBannedNames(markdown) {
  const section = markdown.split('## Action Icon Standards')[1];
  if (section === undefined) return new Set();

  const names = new Set();
  let inTable = false;
  for (const line of section.split('\n')) {
    if (!line.startsWith('|')) {
      if (inTable) break;
      continue;
    }
    inTable = true;
    if (line.includes('---') || line.includes('Banned alternatives')) continue;
    const cells = line.split('|').map((cell) => cell.trim());
    const bannedCell = cells.at(-2) ?? '';
    for (const raw of bannedCell.split(',')) {
      const name = raw.replaceAll('`', '').trim();
      if (name) names.add(name);
    }
  }
  return names;
}

/**
 * Every banned icon name across `.oxlintrc.json`'s `no-restricted-imports`
 * `paths` entries for `lucide-react`.
 *
 * @param {string} oxlintrcSource
 * @returns {Set<string>}
 */
export function parseOxlintBannedNames(oxlintrcSource) {
  const config = JSON.parse(oxlintrcSource);
  const restrictedImports = config.rules?.['no-restricted-imports'];
  const entries = Array.isArray(restrictedImports) ? (restrictedImports[1]?.paths ?? []) : [];

  const names = new Set();
  for (const entry of entries) {
    if (entry.name !== 'lucide-react') continue;
    for (const name of entry.importNames ?? []) names.add(name);
  }
  return names;
}

/**
 * Every banned icon name in `icon-vocabulary-lint.test.ts`'s `cases` array
 * literal — read as source text, not executed, so this guard has no runtime
 * dependency on the test file's structure beyond the `['Banned', 'Canonical']`
 * tuple shape it already documents in its own type annotation.
 *
 * @param {string} testSource
 * @returns {Set<string>}
 */
export function parseTestBannedNames(testSource) {
  const casesMatch = /const cases:[^=]*=\s*\[([\s\S]*?)\n\s*\];/.exec(testSource);
  const body = casesMatch ? casesMatch[1] : '';
  const names = new Set();
  const tupleRe = /\[\s*'([^']+)'\s*,\s*'[^']+'\s*\]/g;
  for (const match of body.matchAll(tupleRe)) names.add(match[1]);
  return names;
}

/**
 * @param {Set<string>} a
 * @param {Set<string>} b
 * @returns {string[]}
 */
function onlyIn(a, b) {
  return [...a].filter((name) => !b.has(name)).toSorted();
}

function run() {
  const readme = readFileSync(join(repoRoot, README_PATH), 'utf8');
  const oxlintrc = readFileSync(join(repoRoot, OXLINTRC_PATH), 'utf8');
  const testSource = readFileSync(join(repoRoot, TEST_PATH), 'utf8');

  const readmeNames = parseReadmeBannedNames(readme);
  const oxlintNames = parseOxlintBannedNames(oxlintrc);
  const testNames = parseTestBannedNames(testSource);

  if (readmeNames.size === 0 || oxlintNames.size === 0 || testNames.size === 0) {
    console.error(
      'One of the three sources produced no banned names at all — the parser broke, this is ' +
        'not a clean tree. ' +
        `README: ${readmeNames.size}, .oxlintrc.json: ${oxlintNames.size}, test: ${testNames.size}.`
    );
    return false;
  }

  /** @type {Array<{ label: string; a: [string, Set<string>]; b: [string, Set<string>] }>} */
  const pairs = [
    { a: [README_PATH, readmeNames], b: [OXLINTRC_PATH, oxlintNames] },
    { a: [OXLINTRC_PATH, oxlintNames], b: [TEST_PATH, testNames] },
    { a: [README_PATH, readmeNames], b: [TEST_PATH, testNames] },
  ];

  let ok = true;
  for (const { a, b } of pairs) {
    const [aLabel, aNames] = a;
    const [bLabel, bNames] = b;
    const missingFromB = onlyIn(aNames, bNames);
    const missingFromA = onlyIn(bNames, aNames);
    if (missingFromB.length > 0) {
      ok = false;
      console.error(`${aLabel} bans ${missingFromB.join(', ')} that ${bLabel} does not.`);
    }
    if (missingFromA.length > 0) {
      ok = false;
      console.error(`${bLabel} bans ${missingFromA.join(', ')} that ${aLabel} does not.`);
    }
  }

  if (ok) {
    console.log(
      `OK — README, .oxlintrc.json, and the test agree on ${oxlintNames.size} banned icon name(s).`
    );
  }
  return ok;
}

/**
 * Synthetic fixtures proving each parser extracts a name from its source and
 * proving the pairwise comparison actually reports a planted drift, in both
 * directions, between every pair of sources.
 *
 * @returns {boolean}
 */
function selfTest() {
  const readmeTable = [
    '## Action Icon Standards',
    '',
    '| Action | Icon | Banned alternatives |',
    '| --- | --- | --- |',
    '| Edit | `Pencil` | `Edit2`, `PenLine` |',
    '| Add | `Plus` |  |',
    '',
    'One icon per action.',
  ].join('\n');

  const oxlintrc = JSON.stringify({
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [{ name: 'lucide-react', importNames: ['Edit2', 'PenLine'] }] },
      ],
    },
  });

  const testSource = [
    'const cases: Array<[banned: string, canonical: string]> = [',
    "  ['Edit2', 'Pencil'],",
    "  ['PenLine', 'Pencil'],",
    '];',
  ].join('\n');

  const readmeNames = parseReadmeBannedNames(readmeTable);
  const oxlintNames = parseOxlintBannedNames(oxlintrc);
  const testNames = parseTestBannedNames(testSource);

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
  const driftedReadmeNames = parseReadmeBannedNames(readmeTable.replace(', `PenLine`', ''));

  const checks = {
    'reads every banned name from the README table':
      [...readmeNames].toSorted().join(',') === 'Edit2,PenLine',
    'ignores a row with an empty Banned alternatives cell': !readmeNames.has('Plus'),
    'reads every importName from .oxlintrc.json':
      [...oxlintNames].toSorted().join(',') === 'Edit2,PenLine',
    'reads the first element of every test case tuple':
      [...testNames].toSorted().join(',') === 'Edit2,PenLine',
    'agrees when all three sources match':
      onlyIn(readmeNames, oxlintNames).length === 0 &&
      onlyIn(oxlintNames, readmeNames).length === 0,
    'catches a name README bans that .oxlintrc.json does not': onlyIn(
      readmeNames,
      driftedOxlintNames
    ).includes('PenLine'),
    'catches a name .oxlintrc.json bans that the README does not': onlyIn(
      oxlintNames,
      driftedReadmeNames
    ).includes('PenLine'),
  };

  const ok = Object.values(checks).every(Boolean);
  if (ok) {
    console.log('self-test OK — guard parses all three sources and reports a planted drift.');
  } else {
    console.error('SELF-TEST FAILED — guard did not behave as expected:');
    for (const [label, passed] of Object.entries(checks)) {
      console.error(`  ${passed ? 'OK' : 'XX'}  ${label}`);
    }
  }
  return ok;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/ci/check-icon-vocabulary-drift.mjs [--self-test]\n' +
        'Asserts libs/ui/README.md, .oxlintrc.json, and icon-vocabulary-lint.test.ts name the\n' +
        'same set of banned lucide-react icons.'
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }
  process.exit(run() ? 0 : 1);
}

if (import.meta.main) {
  main();
}
