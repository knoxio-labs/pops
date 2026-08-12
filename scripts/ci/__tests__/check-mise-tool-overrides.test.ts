import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ALLOWED_UNIT_OVERRIDE_TOOLS,
  checkOverrides,
  COMMITTED_MISE_CONFIG_FILENAMES,
  discoverMiseEnvValues,
  discoverUnitMiseDirs,
  envConfigFilename,
  GITIGNORED_ENV_LOCAL_MISE_CONFIG_EXAMPLES,
  GITIGNORED_MISE_CONFIG_FILENAMES,
  parseToolsTable,
  REQUIRED_ROOT_TOOLS,
  WORKFLOWS_DIR,
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

describe('GITIGNORED_ENV_LOCAL_MISE_CONFIG_EXAMPLES', () => {
  it('shares no path with COMMITTED_MISE_CONFIG_FILENAMES or GITIGNORED_MISE_CONFIG_FILENAMES', () => {
    for (const name of [...COMMITTED_MISE_CONFIG_FILENAMES, ...GITIGNORED_MISE_CONFIG_FILENAMES]) {
      expect(GITIGNORED_ENV_LOCAL_MISE_CONFIG_EXAMPLES).not.toContain(name);
    }
  });

  it.each(GITIGNORED_ENV_LOCAL_MISE_CONFIG_EXAMPLES)(
    '%s is actually gitignored in this repo, not just named ".<env>.local."',
    (relPath) => {
      // Same reasoning as GITIGNORED_MISE_CONFIG_FILENAMES above, one axis
      // wider: an env-suffixed local path this repo had not actually
      // gitignored is exactly the blind spot this list exists to close.
      const result = spawnSync('git', ['check-ignore', '-q', relPath], { cwd: repoRoot });
      expect(result.status, `expected ${relPath} to be gitignored — see .gitignore`).toBe(0);
    }
  );

  it('mise.ci.toml — the committed env-suffixed spelling — is not gitignored, as a sanity check', () => {
    // Proves the .gitignore wildcard on the environment segment only ever
    // matches the *.local.toml shape, not the committed mise.ci.toml this
    // guard is supposed to keep reading.
    const result = spawnSync('git', ['check-ignore', '-q', 'mise.ci.toml'], { cwd: repoRoot });
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

  it("discovers MISE_ENV=ci — the value this repo's quality workflows actually set", () => {
    // Not a hardcoded expectation of what the value happens to be today: this
    // asserts the live discovery mechanism against the real workflows, so a
    // workflow edit that drops MISE_ENV (or changes its value) fails this
    // test rather than silently reopening the POPS-1794 gap.
    expect(discoverMiseEnvValues(repoRoot)).toEqual({ values: ['ci'], violations: [] });
  });
});

describe('envConfigFilename', () => {
  it.each(COMMITTED_MISE_CONFIG_FILENAMES)('inserts the env before the extension of %s', (name) => {
    expect(envConfigFilename(name, 'ci')).toBe(name.replace(/\.toml$/u, '.ci.toml'));
  });

  it("produces the filename this repo's root actually uses for MISE_ENV=ci", () => {
    expect(envConfigFilename('mise.toml', 'ci')).toBe('mise.ci.toml');
  });
});

describe('discoverMiseEnvValues — fixture workflows (POPS-1794)', () => {
  it('reads a workflow-level env: block', () => {
    const root = mkdtempSync(join(tmpdir(), 'mise-env-values-workflow-'));
    try {
      mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
      writeFileSync(
        join(root, '.github', 'workflows', 'quality.yml'),
        'name: quality\nenv:\n  MISE_ENV: ci\njobs:\n  build:\n    runs-on: ubuntu-latest\n'
      );
      expect(discoverMiseEnvValues(root)).toEqual({ values: ['ci'], violations: [] });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reads a workflow filed with the .yaml extension, not only .yml', () => {
    // GitHub Actions accepts either extension for a workflow file. Every
    // workflow in this repo today happens to be .yml, but a guard that only
    // globbed that spelling would silently stop seeing MISE_ENV the day a
    // new workflow used .yaml instead — exactly the "shape it does not
    // model is a pass" failure ADR-045 exists to rule out.
    const root = mkdtempSync(join(tmpdir(), 'mise-env-values-yaml-ext-'));
    try {
      mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
      writeFileSync(
        join(root, '.github', 'workflows', 'quality.yaml'),
        'name: quality\nenv:\n  MISE_ENV: ci\njobs:\n  build:\n    runs-on: ubuntu-latest\n'
      );
      expect(discoverMiseEnvValues(root)).toEqual({ values: ['ci'], violations: [] });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reads a job-level env: block, not only workflow-level', () => {
    const root = mkdtempSync(join(tmpdir(), 'mise-env-values-job-'));
    try {
      mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
      writeFileSync(
        join(root, '.github', 'workflows', 'quality.yml'),
        [
          'name: quality',
          'jobs:',
          '  build:',
          '    runs-on: ubuntu-latest',
          '    env:',
          '      MISE_ENV: staging',
        ].join('\n')
      );
      expect(discoverMiseEnvValues(root).values).toEqual(['staging']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reads a step-level env: block, not only workflow- or job-level', () => {
    const root = mkdtempSync(join(tmpdir(), 'mise-env-values-step-'));
    try {
      mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
      writeFileSync(
        join(root, '.github', 'workflows', 'quality.yml'),
        [
          'name: quality',
          'jobs:',
          '  build:',
          '    runs-on: ubuntu-latest',
          '    steps:',
          '      - run: mise run test',
          '        env:',
          '          MISE_ENV: preview',
        ].join('\n')
      );
      expect(discoverMiseEnvValues(root).values).toEqual(['preview']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('dedupes the same value declared across multiple workflow files', () => {
    const root = mkdtempSync(join(tmpdir(), 'mise-env-values-dedupe-'));
    try {
      mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
      writeFileSync(
        join(root, '.github', 'workflows', 'a.yml'),
        'name: a\nenv:\n  MISE_ENV: ci\njobs:\n  x:\n    runs-on: ubuntu-latest\n'
      );
      writeFileSync(
        join(root, '.github', 'workflows', 'b.yml'),
        'name: b\nenv:\n  MISE_ENV: ci\njobs:\n  x:\n    runs-on: ubuntu-latest\n'
      );
      expect(discoverMiseEnvValues(root).values).toEqual(['ci']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('collects every distinct value across workflows, sorted', () => {
    const root = mkdtempSync(join(tmpdir(), 'mise-env-values-multi-'));
    try {
      mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
      writeFileSync(
        join(root, '.github', 'workflows', 'a.yml'),
        'name: a\nenv:\n  MISE_ENV: staging\njobs:\n  x:\n    runs-on: ubuntu-latest\n'
      );
      writeFileSync(
        join(root, '.github', 'workflows', 'b.yml'),
        'name: b\nenv:\n  MISE_ENV: ci\njobs:\n  x:\n    runs-on: ubuntu-latest\n'
      );
      expect(discoverMiseEnvValues(root).values).toEqual(['ci', 'staging']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns no values, not a crash, when there is no workflows directory at all', () => {
    const root = mkdtempSync(join(tmpdir(), 'mise-env-values-none-'));
    try {
      expect(discoverMiseEnvValues(root)).toEqual({ values: [], violations: [] });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns no values when the workflows directory has no MISE_ENV anywhere', () => {
    const root = mkdtempSync(join(tmpdir(), 'mise-env-values-unset-'));
    try {
      mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
      writeFileSync(
        join(root, '.github', 'workflows', 'quality.yml'),
        'name: quality\njobs:\n  build:\n    runs-on: ubuntu-latest\n'
      );
      expect(discoverMiseEnvValues(root)).toEqual({ values: [], violations: [] });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports an unparseable workflow as a violation rather than silently skipping it (ADR-045)', () => {
    const root = mkdtempSync(join(tmpdir(), 'mise-env-values-badyaml-'));
    try {
      mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
      writeFileSync(join(root, '.github', 'workflows', 'broken.yml'), 'name: broken\non: [push\n');
      const { values, violations } = discoverMiseEnvValues(root);
      expect(values).toEqual([]);
      expect(violations.some((v) => v.includes('could not be parsed'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('ignores non-workflow files sitting in the workflows directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'mise-env-values-nonyml-'));
    try {
      mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
      writeFileSync(join(root, '.github', 'workflows', 'README.md'), '# not a workflow\n');
      expect(discoverMiseEnvValues(root)).toEqual({ values: [], violations: [] });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('discoverUnitMiseDirs / checkOverrides — env-suffixed unit configs (POPS-1794)', () => {
  function writeWorkflowSettingMiseEnv(root: string, env: string) {
    mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
    writeFileSync(
      join(root, '.github', 'workflows', 'quality.yml'),
      `name: quality\nenv:\n  MISE_ENV: ${env}\njobs:\n  build:\n    runs-on: ubuntu-latest\n`
    );
  }

  it('finds a unit config filed as the env-suffixed spelling of mise.toml', () => {
    const root = mkdtempSync(join(tmpdir(), 'mise-env-unit-mise-toml-'));
    try {
      writeWorkflowSettingMiseEnv(root, 'ci');
      mkdirSync(join(root, 'pillars', 'finance'), { recursive: true });
      writeFileSync(join(root, 'pillars', 'finance', 'mise.ci.toml'), '[tools]\nnode = "22"\n');

      expect(discoverUnitMiseDirs(root)).toContainEqual({
        dir: 'pillars/finance',
        file: 'pillars/finance/mise.ci.toml',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not check an env-suffixed spelling for a MISE_ENV value no workflow sets', () => {
    const root = mkdtempSync(join(tmpdir(), 'mise-env-unit-unset-'));
    try {
      writeWorkflowSettingMiseEnv(root, 'ci');
      mkdirSync(join(root, 'pillars', 'finance'), { recursive: true });
      // A staging-suffixed file exists on disk, but no workflow activates MISE_ENV=staging.
      writeFileSync(join(root, 'pillars', 'finance', 'mise.staging.toml'), '[tools]\npnpm = "9"\n');

      const { violations, unitOverrides } = checkOverrides(root);
      expect(unitOverrides.some((u) => u.file.includes('mise.staging.toml'))).toBe(false);
      expect(violations.some((v) => v.includes('mise.staging.toml'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('flags a pnpm override hidden in a per-unit mise.ci.toml — the exact POPS-1794 scenario', () => {
    const root = mkdtempSync(join(tmpdir(), 'mise-env-unit-pnpm-'));
    try {
      writeFileSync(
        join(root, 'mise.toml'),
        '[tools]\nnode = "24.5.0"\npnpm = "10.32.1"\nrust = "stable"\n'
      );
      writeWorkflowSettingMiseEnv(root, 'ci');
      mkdirSync(join(root, 'pillars', 'rogue'), { recursive: true });
      writeFileSync(join(root, 'pillars', 'rogue', 'mise.ci.toml'), '[tools]\npnpm = "9.0.0"\n');

      const { violations } = checkOverrides(root);
      expect(
        violations.some((v) => v.includes('pillars/rogue/mise.ci.toml') && v.includes('pnpm')),
        `expected a violation naming pillars/rogue/mise.ci.toml; got: ${JSON.stringify(violations)}`
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('flags an env-suffixed override filed under a non-default filename spelling too', () => {
    const root = mkdtempSync(join(tmpdir(), 'mise-env-unit-nondefault-'));
    try {
      writeFileSync(
        join(root, 'mise.toml'),
        '[tools]\nnode = "24.5.0"\npnpm = "10.32.1"\nrust = "stable"\n'
      );
      writeWorkflowSettingMiseEnv(root, 'ci');
      const unitDir = join(root, 'pillars', 'rogue');
      mkdirSync(join(unitDir, '.config', 'mise'), { recursive: true });
      writeFileSync(
        join(unitDir, '.config', 'mise', 'config.ci.toml'),
        '[tools]\npnpm = "9.0.0"\n'
      );

      const { violations } = checkOverrides(root);
      expect(
        violations.some(
          (v) => v.includes('pillars/rogue/.config/mise/config.ci.toml') && v.includes('pnpm')
        )
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports an env-suffixed unit config that fails to parse, rather than skipping it', () => {
    const root = mkdtempSync(join(tmpdir(), 'mise-env-unit-badtoml-'));
    try {
      writeFileSync(
        join(root, 'mise.toml'),
        '[tools]\nnode = "24.5.0"\npnpm = "10.32.1"\nrust = "stable"\n'
      );
      writeWorkflowSettingMiseEnv(root, 'ci');
      mkdirSync(join(root, 'pillars', 'finance'), { recursive: true });
      writeFileSync(join(root, 'pillars', 'finance', 'mise.ci.toml'), '[tools\nnode = "22"\n');

      const { violations } = checkOverrides(root);
      expect(
        violations.some(
          (v) => v.includes('pillars/finance/mise.ci.toml') && v.includes('could not be parsed')
        )
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('discoverUnitMiseDirs / checkOverrides — .config/mise/conf.d fragments (POPS-1795)', () => {
  it('finds a single conf.d fragment', () => {
    const root = mkdtempSync(join(tmpdir(), 'mise-confd-single-'));
    try {
      const unitDir = join(root, 'pillars', 'finance');
      mkdirSync(join(unitDir, '.config', 'mise', 'conf.d'), { recursive: true });
      writeFileSync(
        join(unitDir, '.config', 'mise', 'conf.d', '10-node.toml'),
        '[tools]\nnode = "22"\n'
      );

      expect(discoverUnitMiseDirs(root)).toContainEqual({
        dir: 'pillars/finance',
        file: 'pillars/finance/.config/mise/conf.d/10-node.toml',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reads every fragment in the directory, not only the first', () => {
    const root = mkdtempSync(join(tmpdir(), 'mise-confd-multi-'));
    try {
      const unitDir = join(root, 'pillars', 'finance');
      mkdirSync(join(unitDir, '.config', 'mise', 'conf.d'), { recursive: true });
      writeFileSync(
        join(unitDir, '.config', 'mise', 'conf.d', '10-node.toml'),
        '[tools]\nnode = "22"\n'
      );
      writeFileSync(
        join(unitDir, '.config', 'mise', 'conf.d', '20-rust.toml'),
        '[tools]\nrust = "1.80.0"\n'
      );

      const files = discoverUnitMiseDirs(root).map((f) => f.file);
      expect(files).toContain('pillars/finance/.config/mise/conf.d/10-node.toml');
      expect(files).toContain('pillars/finance/.config/mise/conf.d/20-rust.toml');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('ignores a non-.toml file sitting in conf.d', () => {
    const root = mkdtempSync(join(tmpdir(), 'mise-confd-nontoml-'));
    try {
      const unitDir = join(root, 'pillars', 'finance');
      mkdirSync(join(unitDir, '.config', 'mise', 'conf.d'), { recursive: true });
      writeFileSync(join(unitDir, '.config', 'mise', 'conf.d', 'README.md'), '# not toml\n');

      expect(discoverUnitMiseDirs(root).some((f) => f.file.includes('conf.d'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('flags a pnpm override hidden in a conf.d fragment — the exact POPS-1795 scenario', () => {
    const root = mkdtempSync(join(tmpdir(), 'mise-confd-pnpm-'));
    try {
      writeFileSync(
        join(root, 'mise.toml'),
        '[tools]\nnode = "24.5.0"\npnpm = "10.32.1"\nrust = "stable"\n'
      );
      const unitDir = join(root, 'pillars', 'rogue');
      mkdirSync(join(unitDir, '.config', 'mise', 'conf.d'), { recursive: true });
      writeFileSync(
        join(unitDir, '.config', 'mise', 'conf.d', '10-pnpm.toml'),
        '[tools]\npnpm = "9.0.0"\n'
      );

      const { violations } = checkOverrides(root);
      expect(
        violations.some(
          (v) => v.includes('pillars/rogue/.config/mise/conf.d/10-pnpm.toml') && v.includes('pnpm')
        ),
        `expected a violation naming the conf.d fragment; got: ${JSON.stringify(violations)}`
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not confuse a pillar app conf.d fragment for its parent pillar', () => {
    const root = mkdtempSync(join(tmpdir(), 'mise-confd-app-'));
    try {
      const appDir = join(root, 'pillars', 'finance', 'app');
      mkdirSync(join(appDir, '.config', 'mise', 'conf.d'), { recursive: true });
      writeFileSync(
        join(appDir, '.config', 'mise', 'conf.d', '10-node.toml'),
        '[tools]\nnode = "22"\n'
      );

      expect(discoverUnitMiseDirs(root)).toContainEqual({
        dir: 'pillars/finance/app',
        file: 'pillars/finance/app/.config/mise/conf.d/10-node.toml',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('is absent from this repo today, as documented in the guard header', () => {
    expect(discoverUnitMiseDirs(repoRoot).some((f) => f.file.includes('conf.d'))).toBe(false);
  });
});

describe('WORKFLOWS_DIR', () => {
  it('points at the real workflows directory', () => {
    expect(existsSync(join(repoRoot, WORKFLOWS_DIR))).toBe(true);
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
