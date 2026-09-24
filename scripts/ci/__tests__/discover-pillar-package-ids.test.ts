import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { discoverPillarPackageIds } from '../discover-pillar-package-ids.cjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

describe('discoverPillarPackageIds — fixture tree', () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'pillar-package-ids-'));
    const pillarsRoot = join(root, 'pillars');

    mkdirSync(join(pillarsRoot, 'purchases'), { recursive: true });
    writeFileSync(
      join(pillarsRoot, 'purchases', 'package.json'),
      JSON.stringify({ name: '@pops/purchases' })
    );

    mkdirSync(join(pillarsRoot, 'bfm'), { recursive: true });
    writeFileSync(join(pillarsRoot, 'bfm', 'package.json'), JSON.stringify({ name: '@pops/bfm' }));

    mkdirSync(join(pillarsRoot, 'design'), { recursive: true });
    writeFileSync(
      join(pillarsRoot, 'design', 'package.json'),
      JSON.stringify({ name: '@pops/design' })
    );

    // Rust pillar: no package.json at all — not an importable npm package.
    mkdirSync(join(pillarsRoot, 'contacts'), { recursive: true });
    writeFileSync(join(pillarsRoot, 'contacts', 'Cargo.toml'), '');

    // Malformed: name doesn't match the pillar's own directory.
    mkdirSync(join(pillarsRoot, 'mismatch'), { recursive: true });
    writeFileSync(
      join(pillarsRoot, 'mismatch', 'package.json'),
      JSON.stringify({ name: '@pops/other-name' })
    );

    // Not a @pops/* package at all.
    mkdirSync(join(pillarsRoot, 'third-party'), { recursive: true });
    writeFileSync(
      join(pillarsRoot, 'third-party', 'package.json'),
      JSON.stringify({ name: 'left-pad' })
    );

    // A file, not a directory, sitting directly under pillars/.
    writeFileSync(join(pillarsRoot, 'README.md'), '');
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('includes every pillar whose package.json name is @pops/<dirname>', () => {
    const ids = discoverPillarPackageIds(root);
    expect(ids).toContain('purchases');
    expect(ids).toContain('bfm');
    expect(ids).toContain('design');
  });

  it('excludes a pillar with no package.json (e.g. a Rust-only pillar)', () => {
    expect(discoverPillarPackageIds(root)).not.toContain('contacts');
  });

  it('excludes a package.json whose name does not match its own pillar dir', () => {
    expect(discoverPillarPackageIds(root)).not.toContain('mismatch');
    expect(discoverPillarPackageIds(root)).not.toContain('other-name');
  });

  it('excludes a package.json name outside the @pops/ scope', () => {
    expect(discoverPillarPackageIds(root)).not.toContain('third-party');
    expect(discoverPillarPackageIds(root)).not.toContain('left-pad');
  });

  it('returns a sorted list', () => {
    const ids = discoverPillarPackageIds(root);
    expect(ids).toEqual(ids.toSorted());
  });

  it('returns nothing for a tree with no pillars dir', () => {
    const empty = mkdtempSync(join(tmpdir(), 'pillar-package-ids-empty-'));
    try {
      expect(discoverPillarPackageIds(empty)).toEqual([]);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe('ISO-R1 (lib-no-pillar-import) against the live repo', () => {
  it('the disk-derived pillar list includes every real pillar package', () => {
    const ids = discoverPillarPackageIds(repoRoot);
    // These three were missing from the old hand-written regex (POPS-4572) —
    // asserting them here means a future hardcoding regression is caught the
    // same way the original gap would have been.
    expect(ids).toContain('bfm');
    expect(ids).toContain('purchases');
    expect(ids).toContain('design');
  });

  it('a lib importing @pops/purchases, @pops/bfm or @pops/design is reported under ISO-R1', async () => {
    // dependency-cruiser normalizes a `path` array by joining it with `|`
    // and compiling the result to a single RegExp (see
    // normalizeToREAsString in dependency-cruiser's main/helpers.mjs) — this
    // reproduces that exact step against the rule this repo actually ships,
    // so the assertion tracks what `depcruise` will do, not a reimplementation
    // of it.
    const { default: config } = await import(resolve(repoRoot, '.dependency-cruiser.cjs'));
    const rule = config.forbidden.find((r: { name: string }) => r.name === 'lib-no-pillar-import');
    expect(rule).toBeDefined();

    const toPath: string[] = rule.to.path;
    expect(Array.isArray(toPath)).toBe(true);
    const combined = new RegExp(toPath.join('|'));

    for (const pillarImport of ['@pops/purchases', '@pops/bfm', '@pops/design']) {
      expect(combined.test(pillarImport)).toBe(true);
    }

    // Sanity check the rule still catches what it always caught.
    expect(combined.test('@pops/finance')).toBe(true);
    expect(combined.test('pillars/finance/src/x')).toBe(true);
    // And still lets a lib import another lib.
    expect(combined.test('@pops/types')).toBe(false);
  });
});
