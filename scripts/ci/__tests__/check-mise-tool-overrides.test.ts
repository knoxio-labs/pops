import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ALLOWED_UNIT_OVERRIDE_TOOLS,
  checkOverrides,
  discoverUnitMiseDirs,
  parseToolsTable,
  REQUIRED_ROOT_TOOLS,
} from '../check-mise-tool-overrides.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

describe('parseToolsTable', () => {
  it('reads a plain [tools] table', () => {
    expect(parseToolsTable('[tools]\nnode = "24.5.0"\npnpm = "10.32.1"\n')).toEqual({
      node: '24.5.0',
      pnpm: '10.32.1',
    });
  });

  it('unquotes single- and double-quoted values', () => {
    expect(parseToolsTable('[tools]\nnode = \'22.14.0\'\nrust = "stable"\n')).toEqual({
      node: '22.14.0',
      rust: 'stable',
    });
  });

  it('ignores comments and blank lines inside the table', () => {
    const source = ['[tools]', '# pinned for the finance trial', '', 'node = "22"', ''].join('\n');
    expect(parseToolsTable(source)).toEqual({ node: '22' });
  });

  it('stops at the next section header', () => {
    const source = ['[tools]', 'node = "24.5.0"', '', '[tasks.build]', 'run = "tsc -b"'].join('\n');
    expect(parseToolsTable(source)).toEqual({ node: '24.5.0' });
  });

  it('returns an empty map when there is no [tools] table', () => {
    expect(parseToolsTable('[tasks.build]\nrun = "tsc -b"\n')).toEqual({});
  });
});

describe('discoverUnitMiseDirs — fixture tree', () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'mise-overrides-'));
    mkdirSync(join(root, 'pillars', 'finance'), { recursive: true });
    writeFileSync(join(root, 'pillars', 'finance', 'mise.toml'), '[tasks.build]\nrun = "x"\n');

    mkdirSync(join(root, 'pillars', 'finance', 'app'), { recursive: true });
    writeFileSync(
      join(root, 'pillars', 'finance', 'app', 'mise.toml'),
      '[tasks.test]\nrun = "x"\n'
    );

    mkdirSync(join(root, 'pillars', 'moltbot'), { recursive: true }); // no mise.toml

    mkdirSync(join(root, 'libs', 'ui'), { recursive: true });
    writeFileSync(join(root, 'libs', 'ui', 'mise.toml'), '[tasks.test]\nrun = "x"\n');
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('finds a pillar with its own mise.toml', () => {
    expect(discoverUnitMiseDirs(root)).toContain('pillars/finance');
  });

  it('finds a pillar app with its own mise.toml', () => {
    expect(discoverUnitMiseDirs(root)).toContain('pillars/finance/app');
  });

  it('finds a lib with its own mise.toml', () => {
    expect(discoverUnitMiseDirs(root)).toContain('libs/ui');
  });

  it('excludes a pillar with no mise.toml', () => {
    expect(discoverUnitMiseDirs(root)).not.toContain('pillars/moltbot');
  });
});

describe('checkOverrides — fixture tree', () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'mise-overrides-check-'));
    writeFileSync(
      join(root, 'mise.toml'),
      '[tools]\nnode = "24.5.0"\npnpm = "10.32.1"\nrust = "stable"\n'
    );
    mkdirSync(join(root, 'pillars', 'finance'), { recursive: true });
    writeFileSync(join(root, 'pillars', 'finance', 'mise.toml'), '[tools]\nnode = "22.14.0"\n');

    mkdirSync(join(root, 'pillars', 'contacts'), { recursive: true });
    writeFileSync(join(root, 'pillars', 'contacts', 'mise.toml'), '[tools]\nrust = "1.80.0"\n');

    mkdirSync(join(root, 'pillars', 'rogue'), { recursive: true });
    writeFileSync(join(root, 'pillars', 'rogue', 'mise.toml'), '[tools]\npnpm = "9.0.0"\n');
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('reports no baseline drift when the root pin is intact', () => {
    expect(checkOverrides(root).baselineMissing).toEqual([]);
  });

  it('records an allowed node override', () => {
    const { unitOverrides } = checkOverrides(root);
    expect(unitOverrides).toContainEqual({
      dir: 'pillars/finance',
      overrides: { node: '22.14.0' },
    });
  });

  it('records an allowed rust override', () => {
    const { unitOverrides } = checkOverrides(root);
    expect(unitOverrides).toContainEqual({
      dir: 'pillars/contacts',
      overrides: { rust: '1.80.0' },
    });
  });

  it('flags a disallowed pnpm override', () => {
    const { violations } = checkOverrides(root);
    expect(
      violations.some((v) => v.includes('pillars/rogue/mise.toml') && v.includes('pnpm'))
    ).toBe(true);
  });

  it('flags a root pin missing a required tool', () => {
    const brokenRoot = mkdtempSync(join(tmpdir(), 'mise-overrides-broken-'));
    try {
      writeFileSync(join(brokenRoot, 'mise.toml'), '[tools]\nnode = "24.5.0"\n');
      expect(checkOverrides(brokenRoot).baselineMissing.toSorted()).toEqual(['pnpm', 'rust']);
    } finally {
      rmSync(brokenRoot, { recursive: true, force: true });
    }
  });
});

describe('against the live repo', () => {
  it('root mise.toml still declares the full toolchain baseline', () => {
    expect(checkOverrides(repoRoot).baselineMissing).toEqual([]);
  });

  it('no unit overrides a tool outside the allowed set', () => {
    expect(checkOverrides(repoRoot).violations).toEqual([]);
  });

  it("no existing unit currently overrides the toolchain (documents today's baseline)", () => {
    expect(checkOverrides(repoRoot).unitOverrides).toEqual([]);
  });
});

describe('mise actually resolves the merge (real mise binary)', () => {
  let miseAvailable = true;
  beforeAll(() => {
    try {
      execFileSync('mise', ['--version'], { stdio: 'ignore' });
    } catch {
      miseAvailable = false;
    }
  });

  it('every existing pillar/lib still resolves node/pnpm from the root pin', () => {
    if (!miseAvailable) return;
    const rootTools = parseToolsTable(readFileSync(join(repoRoot, 'mise.toml'), 'utf8'));
    for (const dir of discoverUnitMiseDirs(repoRoot)) {
      const unitTools = parseToolsTable(readFileSync(join(repoRoot, dir, 'mise.toml'), 'utf8'));
      for (const tool of ['node', 'pnpm'] as const) {
        if (tool in unitTools) continue; // this unit overrides it — nothing to assert here
        const resolved = execFileSync('mise', ['current', '-C', join(repoRoot, dir), tool], {
          encoding: 'utf8',
        }).trim();
        expect(resolved, `${dir} should inherit root's ${tool} pin`).toBe(rootTools[tool]);
      }
    }
  });

  it('a unit-level [tools] override wins, and un-overridden tools still inherit', () => {
    if (!miseAvailable) return;
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'mise-merge-fixture-'));
    try {
      writeFileSync(join(fixtureRoot, 'mise.toml'), '[tools]\nnode = "24.5.0"\npnpm = "10.32.1"\n');
      mkdirSync(join(fixtureRoot, 'unit'), { recursive: true });
      writeFileSync(join(fixtureRoot, 'unit', 'mise.toml'), '[tools]\nnode = "22.14.0"\n');

      const overriddenNode = execFileSync(
        'mise',
        ['current', '-C', join(fixtureRoot, 'unit'), 'node'],
        { encoding: 'utf8' }
      ).trim();
      expect(overriddenNode).toBe('22.14.0');

      const inheritedPnpm = execFileSync(
        'mise',
        ['current', '-C', join(fixtureRoot, 'unit'), 'pnpm'],
        { encoding: 'utf8' }
      ).trim();
      expect(inheritedPnpm).toBe('10.32.1');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});

describe('ALLOWED_UNIT_OVERRIDE_TOOLS / REQUIRED_ROOT_TOOLS', () => {
  it('never allows pnpm as a per-unit override', () => {
    expect(ALLOWED_UNIT_OVERRIDE_TOOLS).not.toContain('pnpm');
  });

  it('requires the root pin to cover node, pnpm, and rust', () => {
    expect(REQUIRED_ROOT_TOOLS.toSorted()).toEqual(['node', 'pnpm', 'rust']);
  });
});
