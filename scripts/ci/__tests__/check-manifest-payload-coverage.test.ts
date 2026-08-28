/**
 * ADR-045: a guard ships with a test proving it REPORTS. These drive the pure
 * core over source it must flag and source it must not, and exercise discovery
 * against the real tree so a matcher that quietly stops matching fails here
 * rather than printing OK over a repo it can no longer read.
 *
 * The claims below are scoped to what is actually checked. This guard proves a
 * builder is *named beside* the SDK wire validator in one test file; it cannot
 * prove the test calls one with the other. Nothing here says otherwise.
 */

import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  findBuilders,
  findGaps,
  findRegistrars,
  findValidatedBuilders,
  isTestFile,
  scanPillars,
} from '../check-manifest-payload-coverage.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const guard = join(repoRoot, 'scripts', 'ci', 'check-manifest-payload-coverage.mjs');

function reader(tree: Record<string, string>) {
  return (relPath: string) => tree[relPath] ?? '';
}

describe('findBuilders', () => {
  it('finds a function-declaration builder', () => {
    const tree = {
      'pillars/weather/src/api/manifest.ts':
        'export function buildWeatherManifest(v: string): ManifestPayload { return x; }',
    };
    expect(findBuilders(Object.keys(tree), reader(tree))).toEqual([
      {
        pillar: 'weather',
        builder: 'buildWeatherManifest',
        file: 'pillars/weather/src/api/manifest.ts',
      },
    ]);
  });

  it('finds a const-arrow builder', () => {
    const tree = {
      'pillars/tide/src/api/manifest.ts':
        'export const buildTideManifest = (v: string): ManifestPayload => x;',
    };
    expect(findBuilders(Object.keys(tree), reader(tree))).toHaveLength(1);
  });

  it('finds an async builder', () => {
    const tree = {
      'pillars/tide/src/api/manifest.ts':
        'export async function buildTideManifest(v: string): Promise<ManifestPayload> { return x; }',
    };
    expect(findBuilders(Object.keys(tree), reader(tree))).toHaveLength(1);
  });

  it('ignores a builder returning a different manifest type', () => {
    const tree = {
      'pillars/weather/src/api/settings.ts':
        'export function buildWeatherSettingsManifest(): SettingsManifest { return x; }',
    };
    expect(findBuilders(Object.keys(tree), reader(tree))).toEqual([]);
  });

  it('ignores a non-exported builder — nothing else can register it', () => {
    const tree = {
      'pillars/weather/src/api/manifest.ts':
        'function buildWeatherManifest(v: string): ManifestPayload { return x; }',
    };
    expect(findBuilders(Object.keys(tree), reader(tree))).toEqual([]);
  });

  it('does not treat a test file as a builder source', () => {
    const tree = {
      'pillars/weather/src/api/__tests__/manifest.test.ts':
        'export function buildWeatherManifest(v: string): ManifestPayload { return x; }',
    };
    expect(findBuilders(Object.keys(tree), reader(tree))).toEqual([]);
  });

  it('finds several builders in one file', () => {
    const tree = {
      'pillars/cerebrum/src/api/manifest.ts': [
        'export function buildCerebrumManifest(v: string): ManifestPayload { return x; }',
        'export function buildEgoManifest(v: string): ManifestPayload { return y; }',
      ].join('\n'),
    };
    expect(findBuilders(Object.keys(tree), reader(tree)).map((b) => b.builder)).toEqual([
      'buildCerebrumManifest',
      'buildEgoManifest',
    ]);
  });
});

describe('isTestFile', () => {
  it.each([
    'pillars/a/src/api/__tests__/manifest.test.ts',
    'pillars/a/src/lib/register.test.ts',
    'pillars/a/src/lib/register.test.tsx',
    'pillars/a/src/lib/register.spec.ts',
    'pillars/a/src/api/__tests__/helpers.ts',
  ])('treats %s as a test file', (path) => {
    expect(isTestFile(path)).toBe(true);
  });

  it.each(['pillars/a/src/api/manifest.ts', 'pillars/a/src/api/testing.ts'])(
    'treats %s as source',
    (path) => {
      expect(isTestFile(path)).toBe(false);
    }
  );
});

describe('findValidatedBuilders', () => {
  it('accepts validateManifestPayload', () => {
    const tree = {
      'pillars/a/src/api/__tests__/m.test.ts':
        "import { validateManifestPayload } from '@pops/pillar-sdk';\nvalidateManifestPayload(buildAManifest('1.0.0'));",
    };
    expect(findValidatedBuilders(Object.keys(tree), reader(tree))).toEqual(
      new Set(['buildAManifest'])
    );
  });

  it('accepts ManifestPayloadSchema.parse as an equivalent wire check', () => {
    const tree = {
      'pillars/a/src/api/__tests__/m.test.ts':
        "import { ManifestPayloadSchema } from '@pops/pillar-sdk/manifest-schema';\nManifestPayloadSchema.parse(buildAManifest('1.0.0'));",
    };
    expect(findValidatedBuilders(Object.keys(tree), reader(tree))).toEqual(
      new Set(['buildAManifest'])
    );
  });

  it('rejects a test that names the builder but never reaches the wire schema', () => {
    const tree = {
      'pillars/a/src/api/__tests__/m.test.ts': "expect(buildAManifest('1.0.0').pillar).toBe('a');",
    };
    expect(findValidatedBuilders(Object.keys(tree), reader(tree))).toEqual(new Set());
  });

  it('requires both in the SAME file — a split across two tests proves nothing', () => {
    const tree = {
      'pillars/a/src/api/__tests__/validator.test.ts': 'validateManifestPayload(somethingElse);',
      'pillars/a/src/api/__tests__/shape.test.ts': "buildAManifest('1.0.0');",
    };
    expect(findValidatedBuilders(Object.keys(tree), reader(tree)).has('buildAManifest')).toBe(
      false
    );
  });

  it('ignores a non-test source file that calls the validator in production code', () => {
    const tree = {
      'pillars/registry/src/api/register.ts':
        'validateManifestPayload(manifest); // buildAManifest mentioned in a comment',
    };
    expect(findValidatedBuilders(Object.keys(tree), reader(tree))).toEqual(new Set());
  });
});

describe('findGaps', () => {
  const builders = [
    { pillar: 'weather', builder: 'buildWeatherManifest', file: 'pillars/weather/m.ts' },
  ];

  it('passes a builder that is covered', () => {
    expect(findGaps(builders, ['weather'], new Set(['buildWeatherManifest']))).toEqual({
      uncovered: [],
      blindRegistrars: [],
    });
  });

  it('reports a builder no test covers', () => {
    expect(findGaps(builders, ['weather'], new Set()).uncovered).toHaveLength(1);
  });

  it('reports a registrar whose builder the matcher cannot see', () => {
    expect(findGaps([], ['weather'], new Set()).blindRegistrars).toEqual(['weather']);
  });

  it('does not report a builder without a registrar — the shell is exactly that', () => {
    expect(findGaps(builders, [], new Set(['buildWeatherManifest'])).blindRegistrars).toEqual([]);
  });

  it('matches coverage by builder name, not by pillar — two builders in one pillar both count', () => {
    const pair = [
      { pillar: 'cerebrum', builder: 'buildCerebrumManifest', file: 'pillars/cerebrum/m.ts' },
      { pillar: 'cerebrum', builder: 'buildEgoManifest', file: 'pillars/cerebrum/m.ts' },
    ];
    const gaps = findGaps(pair, ['cerebrum'], new Set(['buildCerebrumManifest']));
    expect(gaps.uncovered.map((entry) => entry.builder)).toEqual(['buildEgoManifest']);
  });
});

describe('discovery against the real repo', () => {
  it('finds every pillar that registers, and a builder for each', () => {
    const { files, read } = scanPillars(repoRoot);
    const builders = findBuilders(files, read);
    const registrars = findRegistrars(files, read);

    expect(files.length).toBeGreaterThan(500);
    expect(registrars.length).toBeGreaterThanOrEqual(12);
    expect(builders.length).toBeGreaterThanOrEqual(registrars.length);
    expect(findGaps(builders, registrars, findValidatedBuilders(files, read))).toEqual({
      uncovered: [],
      blindRegistrars: [],
    });
  });

  it('is not a hardcoded pillar list — media, finance and shell are all discovered', () => {
    const { files, read } = scanPillars(repoRoot);
    const builders = findBuilders(files, read).map((entry) => entry.builder);

    expect(builders).toContain('buildMediaManifest');
    expect(builders).toContain('buildFinanceManifest');
    expect(builders).toContain('buildShellManifest');
  });

  it('skips dist/ — a stale compiled copy must not stand in for source', () => {
    const { files } = scanPillars(repoRoot);
    expect(files.some((file) => file.includes('/dist/'))).toBe(false);
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
