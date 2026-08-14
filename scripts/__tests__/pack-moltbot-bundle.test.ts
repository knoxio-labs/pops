/**
 * The moltbot bundle is the artifact that lets a deployer run the `moltbot`
 * compose profile without a source checkout. What makes it correct is not that
 * it contains some files — it is that it contains *every file the compose
 * profile bind-mounts*, in both the prod and dev stacks. The packer itself
 * cannot assert that (it takes the directory wholesale, and stays free of
 * third-party imports because `release.yml` runs it with no `pnpm install`), so
 * the coverage assertion lives here, reading the mounts back out of the real
 * compose files.
 *
 * A bundle that silently stops carrying a mount fails the profile at boot on
 * the deployer's host — the exact failure the artifact exists to remove — and
 * nothing else in CI looks at it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load as parseYaml } from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';

import {
  BUNDLE_ROOT,
  bundleFileName,
  interpolateDefaults,
  listFiles,
  missingFromBundle,
  MOLTBOT_DIR,
  moltbotMountPaths,
  packBundle,
  parseArgs,
  stageBundle,
} from '../pack-moltbot-bundle.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const moltbotDir = join(repoRoot, MOLTBOT_DIR);

const COMPOSE_FILES = ['docker-compose.yml', 'docker-compose.dev.yml'] as const;
const MOLTBOT_SERVICES = ['moltbot', 'moltbot-validator'] as const;

const temps: string[] = [];

afterEach(() => {
  while (temps.length > 0) rmSync(temps.pop() as string, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

/** Every `volumes:` entry the two moltbot services declare, across both stacks. */
function composeMoltbotVolumes(): string[] {
  const entries: string[] = [];
  for (const file of COMPOSE_FILES) {
    const doc = parseYaml(readFileSync(join(repoRoot, 'infra', file), 'utf8'));
    const services = (doc as { services?: Record<string, { volumes?: unknown[] }> }).services ?? {};
    for (const name of MOLTBOT_SERVICES) {
      for (const entry of services[name]?.volumes ?? []) {
        if (typeof entry === 'string') entries.push(entry);
      }
    }
  }
  return entries;
}

function stagedPaths(version = 'v9.9.9'): string[] {
  const staging = tempDir('moltbot-stage-');
  const root = stageBundle({ sourceDir: moltbotDir, stagingDir: staging, version });
  return listFiles(root);
}

describe('compose mount discovery', () => {
  // Every coverage assertion below is vacuous if this returns nothing.
  it('finds the moltbot mounts in both compose stacks', () => {
    const volumes = composeMoltbotVolumes();
    expect(volumes.length).toBeGreaterThanOrEqual(8);
    expect(moltbotMountPaths(volumes)).toContain('scripts/validate-config.sh');
  });

  it('resolves POPS_MOLTBOT_DIR to its compose default before splitting the entry', () => {
    expect(
      moltbotMountPaths([
        '${POPS_MOLTBOT_DIR:-../pillars/moltbot}/config/config.yml:/config/config.yml:ro',
      ])
    ).toEqual(['config/config.yml']);
  });

  it('substitutes the other interpolation forms compose accepts', () => {
    expect(interpolateDefaults('${A-x}/a:/a')).toBe('x/a:/a');
    expect(interpolateDefaults('${A}/a:/a')).toBe('/a:/a');
  });

  it('ignores mounts that are not moltbot content', () => {
    expect(
      moltbotMountPaths([
        './litestream/finance.yml:/etc/litestream.yml:ro',
        '/var/run/docker.sock:/var/run/docker.sock',
        'pops-sqlite-data:/data/sqlite',
      ])
    ).toEqual([]);
  });
});

describe('bundle coverage', () => {
  it('carries every file the moltbot profile bind-mounts', () => {
    expect(missingFromBundle(composeMoltbotVolumes(), stagedPaths())).toEqual([]);
  });

  // The failing case. Without it the assertion above passes on a checker that
  // can no longer report anything.
  it('reports a mount the bundle does not carry', () => {
    expect(
      missingFromBundle(
        ['${POPS_MOLTBOT_DIR:-../pillars/moltbot}/config/absent.yml:/config/config.yml:ro'],
        stagedPaths()
      )
    ).toEqual(['config/absent.yml']);
  });

  it('counts a directory mount as covered by the files under it', () => {
    const mount = '${POPS_MOLTBOT_DIR:-../pillars/moltbot}/skills:/skills:ro';
    expect(moltbotMountPaths([mount])).toEqual(['skills']);
    expect(missingFromBundle([mount], stagedPaths())).toEqual([]);
    expect(missingFromBundle([mount], ['config/config.yml'])).toEqual(['skills']);
  });
});

describe('staging', () => {
  it('stamps the bundle with the release version', () => {
    const staging = tempDir('moltbot-stage-');
    const root = stageBundle({ sourceDir: moltbotDir, stagingDir: staging, version: 'v1.2.3' });
    expect(readFileSync(join(root, 'VERSION'), 'utf8')).toBe('v1.2.3\n');
  });

  it('copies the skill prompts, not just the config', () => {
    expect(stagedPaths()).toEqual(
      expect.arrayContaining([
        'config/config.yml',
        'config/config.dev.yml',
        'scripts/validate-config.sh',
        'skills/pops-cerebrum/SKILL.md',
        'skills/pops-finance/SKILL.md',
      ])
    );
  });

  it('refuses a source directory that is not there', () => {
    expect(() =>
      stageBundle({ sourceDir: join(moltbotDir, 'nope'), stagingDir: tempDir('x-'), version: 'v1' })
    ).toThrow(/not found/u);
  });
});

describe('tarball', () => {
  it('unpacks to a single moltbot/ directory', () => {
    const outDir = tempDir('moltbot-out-');
    const tarball = packBundle({ version: 'v1.2.3', outDir, sourceDir: moltbotDir });
    expect(tarball).toBe(join(outDir, 'moltbot-bundle-v1.2.3.tar.gz'));
    expect(existsSync(tarball)).toBe(true);

    const listed = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' })
      .split('\n')
      .filter((line) => line.length > 0);
    expect(listed.every((entry) => entry.startsWith(`${BUNDLE_ROOT}/`))).toBe(true);
    expect(listed).toContain(`${BUNDLE_ROOT}/skills/pops-finance/SKILL.md`);
    expect(listed).toContain(`${BUNDLE_ROOT}/VERSION`);
  });
});

describe('argument handling', () => {
  it('defaults the output directory but demands a version', () => {
    expect(parseArgs(['--version', 'v1.2.3'])).toEqual({ version: 'v1.2.3', outDir: 'dist' });
    expect(parseArgs(['--version', 'v1.2.3', '--out', 'build'])).toEqual({
      version: 'v1.2.3',
      outDir: 'build',
    });
    expect(() => parseArgs([])).toThrow(/--version is required/u);
    expect(() => parseArgs(['--version'])).toThrow(/needs a value/u);
  });

  // The version reaches a filename straight off a workflow output.
  it('refuses a version that would escape the output directory', () => {
    expect(() => bundleFileName('../../etc/passwd')).toThrow(/invalid version/u);
    expect(() => bundleFileName('v1.2.3; rm -rf /')).toThrow(/invalid version/u);
    expect(bundleFileName('v1.2.3')).toBe('moltbot-bundle-v1.2.3.tar.gz');
  });
});
