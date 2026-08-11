import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ALLOWED_UNIT_OVERRIDE_TOOLS,
  checkOverrides,
  COMMITTED_MISE_CONFIG_FILENAMES,
  discoverUnitMiseDirs,
  GITIGNORED_MISE_CONFIG_FILENAMES,
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

  it('strips a trailing inline comment on a value line', () => {
    expect(parseToolsTable('[tools]\nnode = "24.5.0" # pinned for the finance trial\n')).toEqual({
      node: '24.5.0',
    });
  });

  it('refuses a bare (unquoted) value rather than inventing one', () => {
    // `rust = stable` is not TOML, and mise itself rejects it. The scanner this
    // replaced accepted it and reported `stable`, so a config mise would not
    // load read as a healthy pin here.
    expect(() => parseToolsTable('[tools]\nrust = stable # lagging the bump\n')).toThrow(
      /could not be parsed/u
    );
  });

  it('keeps a # that is inside the quoted value', () => {
    expect(parseToolsTable('[tools]\nnode = "24#5"\n')).toEqual({ node: '24#5' });
  });

  it('stops at the next section header', () => {
    const source = ['[tools]', 'node = "24.5.0"', '', '[tasks.build]', 'run = "tsc -b"'].join('\n');
    expect(parseToolsTable(source)).toEqual({ node: '24.5.0' });
  });

  it('returns an empty map when there is no [tools] table', () => {
    expect(parseToolsTable('[tasks.build]\nrun = "tsc -b"\n')).toEqual({});
  });
});

describe('parseToolsTable — legal TOML spellings of the same override (ADR-045)', () => {
  it('reads a table whose header carries a trailing comment', () => {
    expect(parseToolsTable('[tools] # trial pins\npnpm = "9.0.0"\n')).toEqual({ pnpm: '9.0.0' });
  });

  it('reads a tool declared as a sub-table', () => {
    expect(parseToolsTable('[tools.pnpm]\nversion = "9.0.0"\n')).toEqual({ pnpm: '9.0.0' });
  });

  it('registers a versionless sub-table as a declaration of that tool', () => {
    expect(parseToolsTable('[tools.pnpm]\nbackend = "npm"\n')).toEqual({ pnpm: '' });
  });

  it('reads a quoted sub-table key', () => {
    expect(parseToolsTable('[tools."pnpm"]\nversion = "9"\n')).toEqual({ pnpm: '9' });
  });

  it('reads the inline-table spelling', () => {
    expect(parseToolsTable('tools = { node = "24", pnpm = "9.0.0" }\n')).toEqual({
      node: '24',
      pnpm: '9.0.0',
    });
  });

  it('does not confuse a sub-table of another section for a tool', () => {
    expect(parseToolsTable('[tasks.build]\nrun = "tsc -b"\nversion = "x"\n')).toEqual({});
  });

  it('stops reading a sub-table at the next header', () => {
    const source = ['[tools.node]', 'version = "24"', '[tasks.build]', 'run = "x"'].join('\n');
    expect(parseToolsTable(source)).toEqual({ node: '24' });
  });
});

describe('parseToolsTable — spellings a real parser gets for free', () => {
  it('reads a request list as its highest-priority version', () => {
    expect(parseToolsTable('[tools]\nnode = ["24.5.0", "22"]\n')).toEqual({ node: '24.5.0' });
  });

  it('registers a tool declared only as a sub-table backend', () => {
    expect(parseToolsTable('[tools]\npnpm = { version = "9", backend = "npm" }\n')).toEqual({
      pnpm: '9',
    });
  });

  it('stringifies a numeric pin rather than dropping it', () => {
    expect(parseToolsTable('[tools]\nnode = 24\n')).toEqual({ node: '24' });
  });
});

describe('checkOverrides — degenerate tree (ADR-045)', () => {
  it('reports an unparseable root pin rather than an empty baseline', () => {
    const root = mkdtempSync(join(tmpdir(), 'mise-overrides-badtoml-'));
    try {
      writeFileSync(join(root, 'mise.toml'), '[tools\nnode = "24"\n');
      const { violations, baselineMissing } = checkOverrides(root);
      expect(violations.some((v) => v.includes('could not be parsed'))).toBe(true);
      expect(baselineMissing.toSorted()).toEqual(['node', 'pnpm', 'rust']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports a missing root pin rather than reading the fleet as compliant', () => {
    const root = mkdtempSync(join(tmpdir(), 'mise-overrides-noroot-'));
    try {
      const { violations } = checkOverrides(root);
      expect(violations.some((v) => v.includes('does not exist'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports a unit whose own mise.toml does not parse rather than skipping it', () => {
    const root = mkdtempSync(join(tmpdir(), 'mise-overrides-badunit-'));
    try {
      writeFileSync(
        join(root, 'mise.toml'),
        '[tools]\nnode = "24"\npnpm = "10"\nrust = "stable"\n'
      );
      mkdirSync(join(root, 'pillars', 'finance'), { recursive: true });
      mkdirSync(join(root, 'libs'), { recursive: true });
      writeFileSync(join(root, 'pillars', 'finance', 'mise.toml'), '[tools\nnode = "22"\n');
      const { violations } = checkOverrides(root);
      expect(
        violations.some(
          (v) => v.includes('pillars/finance/mise.toml') && v.includes('could not be parsed')
        )
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports a missing unit-kind directory rather than sweeping zero units', () => {
    const root = mkdtempSync(join(tmpdir(), 'mise-overrides-degenerate-'));
    try {
      writeFileSync(
        join(root, 'mise.toml'),
        '[tools]\nnode = "24"\npnpm = "10"\nrust = "stable"\n'
      );
      const { violations, unitOverrides } = checkOverrides(root);
      expect(unitOverrides).toEqual([]);
      expect(violations.some((v) => v.startsWith('pillars/'))).toBe(true);
      expect(violations.some((v) => v.startsWith('libs/'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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

    mkdirSync(join(root, 'pillars', 'moltbot'), { recursive: true }); // no mise config at all

    mkdirSync(join(root, 'libs', 'ui'), { recursive: true });
    writeFileSync(join(root, 'libs', 'ui', 'mise.toml'), '[tasks.test]\nrun = "x"\n');

    // A unit config filed under a non-default spelling — the exact gap this
    // fixture exists to prove closed.
    mkdirSync(join(root, 'libs', 'sdk', '.config', 'mise'), { recursive: true });
    writeFileSync(
      join(root, 'libs', 'sdk', '.config', 'mise', 'config.toml'),
      '[tasks.test]\nrun = "x"\n'
    );
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('finds a pillar with its own mise.toml', () => {
    expect(discoverUnitMiseDirs(root)).toContainEqual({
      dir: 'pillars/finance',
      file: 'pillars/finance/mise.toml',
    });
  });

  it('finds a pillar app with its own mise.toml', () => {
    expect(discoverUnitMiseDirs(root)).toContainEqual({
      dir: 'pillars/finance/app',
      file: 'pillars/finance/app/mise.toml',
    });
  });

  it('finds a lib with its own mise.toml', () => {
    expect(discoverUnitMiseDirs(root)).toContainEqual({
      dir: 'libs/ui',
      file: 'libs/ui/mise.toml',
    });
  });

  it('finds a lib config filed under a non-"mise.toml" supported spelling', () => {
    expect(discoverUnitMiseDirs(root)).toContainEqual({
      dir: 'libs/sdk',
      file: 'libs/sdk/.config/mise/config.toml',
    });
  });

  it('excludes a pillar with no mise config', () => {
    expect(discoverUnitMiseDirs(root).some((f) => f.dir === 'pillars/moltbot')).toBe(false);
  });
});

describe('discoverUnitMiseDirs — every supported filename', () => {
  it.each(COMMITTED_MISE_CONFIG_FILENAMES)('discovers a unit config filed as %s', (filename) => {
    const root = mkdtempSync(join(tmpdir(), 'mise-overrides-filenames-'));
    try {
      const unitDir = join(root, 'pillars', 'rogue');
      const configPath = join(unitDir, filename);
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, '[tools]\nnode = "22"\n');

      expect(discoverUnitMiseDirs(root)).toContainEqual({
        dir: 'pillars/rogue',
        file: `pillars/rogue/${filename}`,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reads every present file rather than stopping at the highest-precedence one', () => {
    const root = mkdtempSync(join(tmpdir(), 'mise-overrides-multifile-'));
    try {
      const unitDir = join(root, 'pillars', 'rogue');
      mkdirSync(unitDir, { recursive: true });
      writeFileSync(join(unitDir, 'mise.toml'), '[tools]\nnode = "22"\n');
      writeFileSync(join(unitDir, '.mise.toml'), '[tools]\npnpm = "9.0.0"\n');

      const files = discoverUnitMiseDirs(root).map((f) => f.file);
      expect(files).toContain('pillars/rogue/mise.toml');
      expect(files).toContain('pillars/rogue/.mise.toml');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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
      file: 'pillars/finance/mise.toml',
      overrides: { node: '22.14.0' },
    });
  });

  it('records an allowed rust override', () => {
    const { unitOverrides } = checkOverrides(root);
    expect(unitOverrides).toContainEqual({
      dir: 'pillars/contacts',
      file: 'pillars/contacts/mise.toml',
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

describe('checkOverrides — a pnpm fork hidden behind each supported filename', () => {
  it.each(COMMITTED_MISE_CONFIG_FILENAMES)('flags a pnpm override filed as %s', (filename) => {
    const root = mkdtempSync(join(tmpdir(), 'mise-overrides-hidden-pnpm-'));
    try {
      writeFileSync(
        join(root, 'mise.toml'),
        '[tools]\nnode = "24.5.0"\npnpm = "10.32.1"\nrust = "stable"\n'
      );
      const unitDir = join(root, 'pillars', 'rogue');
      const configPath = join(unitDir, filename);
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, '[tools]\npnpm = "9.0.0"\n');

      const { violations } = checkOverrides(root);
      expect(
        violations.some((v) => v.includes(`pillars/rogue/${filename}`) && v.includes('pnpm')),
        `expected a violation naming pillars/rogue/${filename}; got: ${JSON.stringify(violations)}`
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not confuse a filename that only ever holds a local, gitignored override', () => {
    // mise.local.toml is real and mise reads it, but it is gitignored in this
    // repo, so a fresh CI checkout never has one — the guard is correct to
    // leave it out of COMMITTED_MISE_CONFIG_FILENAMES.
    expect(COMMITTED_MISE_CONFIG_FILENAMES).not.toContain('mise.local.toml');
    expect(COMMITTED_MISE_CONFIG_FILENAMES).not.toContain('.mise.local.toml');
  });
});

describe('COMMITTED_MISE_CONFIG_FILENAMES / GITIGNORED_MISE_CONFIG_FILENAMES', () => {
  it('the two lists share no filename', () => {
    for (const name of COMMITTED_MISE_CONFIG_FILENAMES) {
      expect(GITIGNORED_MISE_CONFIG_FILENAMES).not.toContain(name);
    }
  });

  it.each(GITIGNORED_MISE_CONFIG_FILENAMES)(
    '%s is actually gitignored in this repo, not just named "local"',
    (relPath) => {
      // The guard's exclusion reasoning depends on git, not on the filename
      // containing ".local." — a path this repo had not actually gitignored
      // would be exactly the invisible-override gap this filename widening
      // exists to close. `check-ignore` works on the pattern alone, so the
      // path need not exist.
      const result = spawnSync('git', ['check-ignore', '-q', relPath], { cwd: repoRoot });
      expect(result.status, `expected ${relPath} to be gitignored — see .gitignore`).toBe(0);
    }
  );

  it('mise.toml itself is not gitignored, as a sanity check on the check above', () => {
    const result = spawnSync('git', ['check-ignore', '-q', 'mise.toml'], { cwd: repoRoot });
    expect(result.status).toBe(1);
  });
});

describe('against the live repo', () => {
  it('root mise.toml still declares the full toolchain baseline', () => {
    expect(checkOverrides(repoRoot).baselineMissing).toEqual([]);
  });

  it('no unit overrides a tool outside the allowed set', () => {
    expect(checkOverrides(repoRoot).violations).toEqual([]);
  });

  it('every existing unit override stays within the allowed tool set', () => {
    const { unitOverrides } = checkOverrides(repoRoot);
    for (const { dir, overrides } of unitOverrides) {
      for (const key of Object.keys(overrides)) {
        expect(ALLOWED_UNIT_OVERRIDE_TOOLS, `${dir} overrides "${key}"`).toContain(key);
      }
    }
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
    for (const { dir, file } of discoverUnitMiseDirs(repoRoot)) {
      const unitTools = parseToolsTable(readFileSync(join(repoRoot, file), 'utf8'));
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
