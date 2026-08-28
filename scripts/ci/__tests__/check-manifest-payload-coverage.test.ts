/**
 * ADR-045: a guard ships with a test proving it REPORTS. These drive the pure
 * core over source it must flag and source it must not, and exercise discovery
 * against the real tree so a matcher that quietly stops matching fails here
 * rather than printing OK over a repo it can no longer read.
 *
 * The claims here are scoped to what is actually checked. This guard proves a
 * builder is *named beside* the SDK wire validator in one vitest-collected
 * file in its own pillar; it cannot prove the test calls one with the other,
 * or that the test runs. Nothing here says otherwise.
 *
 * Several cases below exist because an adversarial pass found them silent
 * (POPS-2585, per ADR-045's requirement that a guard be reviewed by someone
 * other than its author): a signature wrapped over lines hid a builder, a
 * pillar's second builder was invisible behind the per-pillar registrar
 * check, coverage was matched by builder name repo-wide rather than within the
 * owning pillar, an uncollected `__tests__/helpers.ts` satisfied coverage, and
 * a symlinked pillar directory vanished from both derived sets at once. Each
 * has a test here, and each is a case the previous self-test passed over.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import {
  findBuilders,
  findGaps,
  findRegistrars,
  findValidatedBuilders,
  isTestFile,
  listSourceFiles,
  scanPillars,
} from '../check-manifest-payload-coverage.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const guard = join(repoRoot, 'scripts', 'ci', 'check-manifest-payload-coverage.mjs');

/**
 * Every manifest builder in the repo, typed out once. Checked against what
 * discovery actually finds, never against the guard's own matcher — the
 * ADR-045 rule that a pin is only independent when one side comes from
 * something the guard does not author.
 *
 * This is the only thing standing behind `buildShellManifest`: the shell
 * registers through its own CLI rather than `bootstrapPillar`, so the
 * registrar cross-check has nothing to say about it. Adding a pillar means
 * adding its builder here, deliberately.
 */
const EXPECTED_BUILDERS = [
  'buildAiManifest',
  'buildBfmManifest',
  'buildCerebrumManifest',
  'buildDocumentsManifest',
  'buildFinanceManifest',
  'buildFoodManifest',
  'buildInventoryManifest',
  'buildListsManifest',
  'buildMediaManifest',
  'buildOrchestratorManifest',
  'buildPurchasesManifest',
  'buildRegistryManifest',
  'buildShellManifest',
];

function reader(tree: Record<string, string>) {
  return (relPath: string) => tree[relPath] ?? '';
}

function builderNames(tree: Record<string, string>): string[] {
  return findBuilders(Object.keys(tree), reader(tree)).map((entry) => entry.builder);
}

describe('findBuilders is blind to declaration syntax', () => {
  // Every one of these was invisible to the original line-anchored matcher.
  it.each([
    [
      'a signature wrapped over lines',
      'export function buildXManifest(\n  version: string,\n  baseUrl: string\n): ManifestPayload {\n  return p;\n}',
    ],
    [
      'a default export',
      'const p: ManifestPayload = q;\nexport default function buildXManifest(v) {\n  return p;\n}',
    ],
    [
      'a barrel re-export',
      "import type { ManifestPayload } from '@pops/pillar-sdk';\nexport { buildXManifest } from './m.js';",
    ],
    [
      'an inferred return type with satisfies',
      "import type { ManifestPayload } from '@pops/pillar-sdk';\nexport const buildXManifest = (v) => p satisfies ManifestPayload;",
    ],
    [
      'an aliased builder type',
      "import type { ManifestPayload } from './t.js';\nexport const buildXManifest: Builder = (v) => p;",
    ],
    ['a wrapped arrow', 'export const buildXManifest =\n  (v: string): ManifestPayload =>\n    p;'],
    [
      'a deferred export statement',
      'const buildXManifest = (v): ManifestPayload => p;\nexport { buildXManifest };',
    ],
    [
      'an async builder',
      'export async function buildXManifest(\n  v: string\n): Promise<ManifestPayload> {\n  return p;\n}',
    ],
    [
      'a class static method',
      'class M {\n  static buildXManifest(v: string): ManifestPayload {\n    return p;\n  }\n}\nexport { M };',
    ],
  ])('finds a builder declared as %s', (_label, source) => {
    expect(builderNames({ 'pillars/x/src/api/manifest.ts': source })).toEqual(['buildXManifest']);
  });

  it('ignores a builder in a file that never mentions ManifestPayload', () => {
    expect(
      builderNames({
        'pillars/x/src/api/settings.ts':
          'export function buildXSettingsManifest(): SettingsManifest {\n  return s;\n}',
      })
    ).toEqual([]);
  });

  it('does not treat a test file as a builder source', () => {
    expect(
      builderNames({
        'pillars/x/src/api/__tests__/manifest.test.ts':
          'export function buildXManifest(v: string): ManifestPayload {\n  return p;\n}',
      })
    ).toEqual([]);
  });

  it('finds several builders in one file', () => {
    expect(
      builderNames({
        'pillars/cerebrum/src/api/manifest.ts': [
          'export function buildCerebrumManifest(v: string): ManifestPayload { return x; }',
          'export function buildEgoManifest(v: string): ManifestPayload { return y; }',
        ].join('\n'),
      })
    ).toEqual(['buildCerebrumManifest', 'buildEgoManifest']);
  });

  it('reports each builder once per file, not once per mention', () => {
    expect(
      builderNames({
        'pillars/x/src/api/manifest.ts':
          'export function buildXManifest(v: string): ManifestPayload {\n  return buildXManifest.cache ?? p;\n}',
      })
    ).toEqual(['buildXManifest']);
  });
});

describe('isTestFile', () => {
  it.each([
    'pillars/a/src/api/__tests__/manifest.test.ts',
    'pillars/a/src/lib/register.test.ts',
    'pillars/a/src/lib/register.test.tsx',
    'pillars/a/src/lib/register.spec.ts',
  ])('treats %s as a test file', (path) => {
    expect(isTestFile(path)).toBe(true);
  });

  // A helper in `__tests__` is never collected by vitest, so counting it as a
  // test would let a fixture stand in for a test that does not exist.
  it.each([
    'pillars/a/src/api/__tests__/helpers.ts',
    'pillars/a/src/api/__tests__/fixtures.ts',
    'pillars/a/src/api/manifest.ts',
    'pillars/a/src/api/testing.ts',
  ])('treats %s as source', (path) => {
    expect(isTestFile(path)).toBe(false);
  });
});

describe('findValidatedBuilders', () => {
  it('accepts validateManifestPayload', () => {
    const tree = {
      'pillars/a/src/api/__tests__/m.test.ts':
        "import { validateManifestPayload } from '@pops/pillar-sdk';\nvalidateManifestPayload(buildAManifest('1.0.0'));",
    };
    expect(findValidatedBuilders(Object.keys(tree), reader(tree)).get('a')).toEqual(
      new Set(['buildAManifest'])
    );
  });

  it('accepts ManifestPayloadSchema.parse as an equivalent wire check', () => {
    const tree = {
      'pillars/a/src/api/__tests__/m.test.ts':
        "import { ManifestPayloadSchema } from '@pops/pillar-sdk/manifest-schema';\nManifestPayloadSchema.parse(buildAManifest('1.0.0'));",
    };
    expect(findValidatedBuilders(Object.keys(tree), reader(tree)).get('a')).toEqual(
      new Set(['buildAManifest'])
    );
  });

  it('rejects a test that names the builder but never reaches the wire schema', () => {
    const tree = {
      'pillars/a/src/api/__tests__/m.test.ts': "expect(buildAManifest('1.0.0').pillar).toBe('a');",
    };
    expect(findValidatedBuilders(Object.keys(tree), reader(tree)).size).toBe(0);
  });

  it('requires both in the SAME file — a split across two tests proves nothing', () => {
    const tree = {
      'pillars/a/src/api/__tests__/validator.test.ts': 'validateManifestPayload(somethingElse);',
      'pillars/a/src/api/__tests__/shape.test.ts': "buildAManifest('1.0.0');",
    };
    expect(findValidatedBuilders(Object.keys(tree), reader(tree)).get('a')?.size ?? 0).toBe(0);
  });

  it('keys by pillar, so one pillar cannot vouch for another', () => {
    const tree = {
      'pillars/inventory/src/api/__tests__/m.test.ts':
        "validateManifestPayload(buildMediaManifest('1.0.0'));",
    };
    const validated = findValidatedBuilders(Object.keys(tree), reader(tree));
    expect(validated.get('inventory')).toEqual(new Set(['buildMediaManifest']));
    expect(validated.get('media')).toBeUndefined();
  });

  it('ignores a non-test source file that calls the validator in production code', () => {
    const tree = {
      'pillars/registry/src/api/register.ts':
        'validateManifestPayload(manifest); // buildAManifest mentioned in a comment',
    };
    expect(findValidatedBuilders(Object.keys(tree), reader(tree)).size).toBe(0);
  });
});

describe('findGaps', () => {
  const builders = [
    { pillar: 'weather', builder: 'buildWeatherManifest', file: 'pillars/weather/m.ts' },
  ];
  const covered = new Map([['weather', new Set(['buildWeatherManifest'])]]);

  it('passes a builder that is covered', () => {
    expect(findGaps(builders, ['weather'], covered)).toEqual({
      uncovered: [],
      blindRegistrars: [],
    });
  });

  it('reports a builder no test covers', () => {
    expect(findGaps(builders, ['weather'], new Map()).uncovered).toHaveLength(1);
  });

  it('reports a builder covered only by another pillar’s test', () => {
    const foreign = new Map([['inventory', new Set(['buildWeatherManifest'])]]);
    expect(findGaps(builders, ['weather'], foreign).uncovered).toHaveLength(1);
  });

  it('reports a registrar whose builder the matcher cannot see', () => {
    expect(findGaps([], ['weather'], new Map()).blindRegistrars).toEqual(['weather']);
  });

  it('does not report a builder without a registrar — the shell is exactly that', () => {
    expect(findGaps(builders, [], covered).blindRegistrars).toEqual([]);
  });

  it('reports a pillar’s second builder even though the first one covers the pillar', () => {
    const pair = [
      { pillar: 'cerebrum', builder: 'buildCerebrumManifest', file: 'pillars/cerebrum/m.ts' },
      { pillar: 'cerebrum', builder: 'buildEgoManifest', file: 'pillars/cerebrum/m.ts' },
    ];
    const partial = new Map([['cerebrum', new Set(['buildCerebrumManifest'])]]);
    const gaps = findGaps(pair, ['cerebrum'], partial);
    expect(gaps.uncovered.map((entry) => entry.builder)).toEqual(['buildEgoManifest']);
    // The registrar net stays quiet here — it is an existence check per
    // pillar. This assertion records that limit rather than hiding it: the
    // `uncovered` list above is what catches the second builder.
    expect(gaps.blindRegistrars).toEqual([]);
  });
});

describe('listSourceFiles refuses to drop what it cannot classify', () => {
  const sandbox = join(tmpdir(), 'manifest-coverage-walk');

  afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

  it('returns a symlinked pillar directory instead of silently skipping it', () => {
    rmSync(sandbox, { recursive: true, force: true });
    const pillars = join(sandbox, 'pillars');
    mkdirSync(join(pillars, 'media'), { recursive: true });
    mkdirSync(join(sandbox, 'elsewhere'), { recursive: true });
    writeFileSync(join(pillars, 'media', 'manifest.ts'), 'const x: ManifestPayload = p;');
    writeFileSync(join(sandbox, 'elsewhere', 'manifest.ts'), 'const x: ManifestPayload = p;');
    symlinkSync(join(sandbox, 'elsewhere'), join(pillars, 'weather'));

    const { files, unclassified } = listSourceFiles(pillars, sandbox);

    expect(files).toEqual(['pillars/media/manifest.ts']);
    // A dropped entry would remove `weather` from the builder set AND the
    // registrar set at once, which the cross-check between them cannot see.
    expect(unclassified).toEqual(['pillars/weather']);
  });

  it('skips dot-directories, as .gitignore says the scripts/ guards do', () => {
    rmSync(sandbox, { recursive: true, force: true });
    const pillars = join(sandbox, 'pillars');
    mkdirSync(join(pillars, 'media', '.next', 'types'), { recursive: true });
    writeFileSync(join(pillars, 'media', 'manifest.ts'), 'const x: ManifestPayload = p;');
    writeFileSync(
      join(pillars, 'media', '.next', 'types', 'gen.ts'),
      'export function buildGeneratedManifest(): ManifestPayload { return p; }'
    );

    expect(listSourceFiles(pillars, sandbox).files).toEqual(['pillars/media/manifest.ts']);
  });
});

describe('discovery against the real repo', () => {
  it('finds every manifest builder in the tree, by name', () => {
    const { files, read } = scanPillars(repoRoot);
    const found = findBuilders(files, read).map((entry) => entry.builder);

    // Exact, not a floor: a discovery regression that drops one builder is
    // otherwise invisible, and for `buildShellManifest` this is the only
    // check there is.
    expect([...new Set(found)].toSorted()).toEqual(EXPECTED_BUILDERS.toSorted());
  });

  it('walks the whole pillar tree, not a fraction of it', () => {
    const { files, unclassified } = scanPillars(repoRoot);

    // The real count is ~4300. A floor of 500 would pass over an 88% loss.
    expect(files.length).toBeGreaterThan(3000);
    expect(unclassified).toEqual([]);
  });

  it('finds every pillar that registers, and covers all of them', () => {
    const { files, read } = scanPillars(repoRoot);
    const registrars = findRegistrars(files, read);

    expect(registrars.length).toBeGreaterThanOrEqual(12);
    expect(
      findGaps(findBuilders(files, read), registrars, findValidatedBuilders(files, read))
    ).toEqual({ uncovered: [], blindRegistrars: [] });
  });

  it('skips dist/ — a stale compiled copy must not stand in for source', () => {
    expect(scanPillars(repoRoot).files.some((file) => file.includes('/dist/'))).toBe(false);
  });

  // The Rust pillar hand-writes a ManifestPayload-shaped value and registers
  // it, and this guard cannot see a line of it. Asserting the blind spot keeps
  // the file header honest: if contacts ever becomes visible, this test fails
  // and the header's "WHAT IT CANNOT SEE" section gets revisited. POPS-2592.
  it('does not see the Rust contacts pillar, as its own header admits', () => {
    const { files } = scanPillars(repoRoot);

    expect(files.filter((file) => file.startsWith('pillars/contacts/'))).toEqual([]);
  });
});

describe('the guard CLI', () => {
  it('its self-test passes', () => {
    expect(() => execFileSync('node', [guard, '--self-test'], { stdio: 'pipe' })).not.toThrow();
  });

  it('passes against the real tree', () => {
    expect(() => execFileSync('node', [guard], { stdio: 'pipe' })).not.toThrow();
  });

  it('exits 2 on --help', () => {
    try {
      execFileSync('node', [guard, '--help'], { stdio: 'pipe' });
      throw new Error('expected --help to exit non-zero');
    } catch (error) {
      expect((error as { status?: number }).status).toBe(2);
    }
  });
});
