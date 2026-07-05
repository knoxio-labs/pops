import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  discoverDataPillarIds,
  extractCuratedPillarIds,
  findDrift,
} from '../check-known-pillars-coverage.mjs';

describe('extractCuratedPillarIds', () => {
  it('extracts every id from the `as const` tuple', () => {
    const source = [
      'export const PILLARS = [',
      "  'registry',",
      "  'finance',",
      "  'media',",
      '] as const;',
      '',
      'export type PillarId = string;',
    ].join('\n');
    expect(extractCuratedPillarIds(source)).toEqual(['finance', 'media', 'registry']);
  });

  it('throws when the tuple cannot be found (renamed/reshaped export)', () => {
    expect(() => extractCuratedPillarIds('export const OTHER = [] as const;')).toThrow();
  });
});

describe('findDrift', () => {
  it('reports no drift when the sets match', () => {
    expect(findDrift(['finance', 'media'], ['finance', 'media'])).toEqual({
      missing: [],
      extra: [],
    });
  });

  it('reports a data pillar dir with no PILLARS entry as missing', () => {
    expect(findDrift(['finance', 'weather'], ['finance'])).toEqual({
      missing: ['weather'],
      extra: [],
    });
  });

  it('reports a PILLARS entry with no matching data pillar dir as extra', () => {
    expect(findDrift(['finance'], ['finance', 'ghost'])).toEqual({
      missing: [],
      extra: ['ghost'],
    });
  });
});

describe('discoverDataPillarIds — fixture tree', () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'known-pillars-'));
    const pillarsRoot = join(root, 'pillars');

    mkdirSync(join(pillarsRoot, 'finance', 'src', 'db'), { recursive: true });
    writeFileSync(join(pillarsRoot, 'finance', 'src', 'db', 'schema.ts'), '');

    mkdirSync(join(pillarsRoot, 'contacts', 'migrations'), { recursive: true });
    writeFileSync(join(pillarsRoot, 'contacts', 'Cargo.toml'), '');

    mkdirSync(join(pillarsRoot, 'shell', 'src'), { recursive: true });
    writeFileSync(join(pillarsRoot, 'shell', 'package.json'), '{}');

    mkdirSync(join(pillarsRoot, 'orphan-rust'), { recursive: true });
    writeFileSync(join(pillarsRoot, 'orphan-rust', 'Cargo.toml'), '');
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('includes a TS pillar that owns a db schema barrel', () => {
    expect(discoverDataPillarIds(root)).toContain('finance');
  });

  it('includes a Rust pillar with Cargo.toml + a migrations dir', () => {
    expect(discoverDataPillarIds(root)).toContain('contacts');
  });

  it('excludes a pillar dir that owns no DB (shell)', () => {
    expect(discoverDataPillarIds(root)).not.toContain('shell');
  });

  it('excludes a Rust crate with no migrations dir', () => {
    expect(discoverDataPillarIds(root)).not.toContain('orphan-rust');
  });

  it('returns nothing for a tree with no pillars dir', () => {
    const empty = mkdtempSync(join(tmpdir(), 'known-pillars-empty-'));
    try {
      expect(discoverDataPillarIds(empty)).toEqual([]);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe('against the live repo', () => {
  it('PILLARS has no drift against the on-disk data pillar set', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const here = dirname(fileURLToPath(import.meta.url));
    const repoRoot = resolve(here, '..', '..', '..');
    const knownPillarIdPath = resolve(
      repoRoot,
      'libs',
      'sdk',
      'src',
      'capabilities',
      'known-pillar-id.ts'
    );

    const dataPillarIds = discoverDataPillarIds(repoRoot);
    const curatedPillarIds = extractCuratedPillarIds(readFileSync(knownPillarIdPath, 'utf8'));

    expect(findDrift(dataPillarIds, curatedPillarIds)).toEqual({ missing: [], extra: [] });
  });
});
