import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  collectStreams,
  freshVolumeName,
  parseExposedPort,
  parseRuntimeBaseImage,
  planSmoke,
  resolveHealthPath,
  runtimeStage,
} from '../smoke-image.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Pillar ids whose directory contains every one of the named entries. */
function pillarsWith(...entries: readonly string[]): string[] {
  return readdirSync(join(repoRoot, 'pillars'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((id) => entries.every((path) => existsSync(join(repoRoot, 'pillars', id, path))));
}

function readDockerfile(pillarId: string): string {
  return readFileSync(join(repoRoot, 'pillars', pillarId, 'Dockerfile'), 'utf8');
}

describe('parseExposedPort', () => {
  it('reads the exposed port', () => {
    expect(parseExposedPort('FROM node:24-slim\nEXPOSE 3004\nCMD ["node", "x.js"]\n')).toBe(3004);
  });

  it('is case-insensitive and tolerates leading whitespace', () => {
    expect(parseExposedPort('FROM x\n  expose 80\n')).toBe(80);
  });

  it('accepts the same port repeated across stages', () => {
    expect(parseExposedPort('FROM x AS a\nEXPOSE 3001\nFROM y\nEXPOSE 3001\n')).toBe(3001);
  });

  it('refuses a Dockerfile with no EXPOSE rather than guessing a port', () => {
    expect(() => parseExposedPort('FROM node:24-slim\nCMD ["node"]\n')).toThrow(/no EXPOSE/u);
  });

  it('refuses two distinct exposed ports rather than picking one', () => {
    expect(() => parseExposedPort('FROM x\nEXPOSE 80\nEXPOSE 443\n')).toThrow(/ambiguous/u);
  });
});

describe('parseRuntimeBaseImage', () => {
  it('returns the final stage base, not the builder', () => {
    const dockerfile = 'FROM node:24-slim AS builder\nRUN true\nFROM nginx:1.31.3-alpine\n';
    expect(parseRuntimeBaseImage(dockerfile)).toBe('nginx:1.31.3-alpine');
  });

  it('throws on input with no FROM', () => {
    expect(() => parseRuntimeBaseImage('EXPOSE 80\n')).toThrow(/no FROM/u);
  });
});

describe('runtimeStage', () => {
  it('begins at the final FROM, so a builder-stage line is not read as shipped', () => {
    const dockerfile = [
      'FROM node:24-slim AS builder',
      'RUN mkdir -p /data/sqlite && chown -R node:node /data',
      'FROM node:24-slim',
      'USER node',
      '',
    ].join('\n');
    const stage = runtimeStage(dockerfile);
    expect(stage).not.toContain('AS builder');
    expect(stage).not.toContain('mkdir');
    expect(stage).toContain('USER node');
  });

  it('returns the whole file when there is only one stage', () => {
    expect(runtimeStage('FROM nginx:1.31.3-alpine\nEXPOSE 80\n')).toBe(
      'FROM nginx:1.31.3-alpine\nEXPOSE 80\n'
    );
  });

  it('throws on input with no FROM', () => {
    expect(() => runtimeStage('EXPOSE 80\n')).toThrow(/no FROM/u);
  });
});

describe('freshVolumeName', () => {
  it('carries the pillar id, so a volume leaked by a crashed run is identifiable', () => {
    expect(freshVolumeName('pillars/finance/Dockerfile')).toMatch(
      /^pops-smoke-finance-[0-9a-f]{8}$/u
    );
  });

  it('never repeats — a recycled volume carries the very ownership under test', () => {
    const names = new Set(
      Array.from({ length: 100 }, () => freshVolumeName('pillars/finance/Dockerfile'))
    );
    expect(names.size).toBe(100);
  });
});

describe('resolveHealthPath', () => {
  it('probes / for nginx-served images', () => {
    expect(resolveHealthPath('nginx:1.31.3-alpine')).toBe('/');
  });

  it('probes /health for application images', () => {
    expect(resolveHealthPath('node:24-slim')).toBe('/health');
    expect(resolveHealthPath('debian:bookworm-slim')).toBe('/health');
  });

  it('does not treat a lookalike name as nginx', () => {
    expect(resolveHealthPath('nginxinc-unofficial:1')).toBe('/health');
  });
});

describe('collectStreams', () => {
  it('returns both captured streams from a failed execFile rejection', () => {
    const err = Object.assign(new Error('Command failed: docker logs x'), {
      stdout: 'out\n',
      stderr: 'boom\n',
    });
    expect(collectStreams(err)).toBe('out\nboom\n');
  });

  it('returns whichever stream is populated', () => {
    expect(collectStreams(Object.assign(new Error('x'), { stdout: '', stderr: 'only-err' }))).toBe(
      'only-err'
    );
  });

  it('returns empty for a rejection carrying no streams, so the caller falls back to the message', () => {
    expect(collectStreams(new Error('spawn ENOENT'))).toBe('');
    expect(collectStreams('not an error')).toBe('');
    expect(collectStreams(null)).toBe('');
  });

  it('ignores non-string stream fields', () => {
    expect(collectStreams(Object.assign(new Error('x'), { stdout: 42, stderr: undefined }))).toBe(
      ''
    );
  });
});

describe('planSmoke — every pillar Dockerfile on disk', () => {
  const pillars = pillarsWith('Dockerfile');

  it('finds Dockerfiles to check (the discovery itself is not silently empty)', () => {
    expect(pillars.length).toBeGreaterThan(0);
  });

  it.each(pillars)('pillars/%s/Dockerfile yields a usable smoke plan', (id) => {
    const plan = planSmoke(readDockerfile(id));
    expect(plan.port).toBeGreaterThan(0);
    expect(plan.healthPath.startsWith('/')).toBe(true);
  });
});

describe('the deploy step every Node pillar image depends on', () => {
  // Regression guard for the pnpm 11 `--legacy` deploy: it writes relative
  // `@pops/*` symlinks that escape /app/deploy, so the image builds clean and
  // the container dies on its first import. The runtime smoke is the real
  // gate; this is the fast, docker-free half that names the fix.
  it.each(pillarsWith('Dockerfile'))('pillars/%s does not use `pnpm deploy --legacy`', (id) => {
    const deployLines = readDockerfile(id)
      .split('\n')
      .filter((line) => /^\s*RUN\s.*\bpnpm\b.*\bdeploy\b/u.test(line));
    for (const line of deployLines) {
      expect(line).not.toContain('--legacy');
      expect(line).toContain('--config.inject-workspace-packages=true');
    }
  });
});

describe('the fresh-volume contract, for every pillar image that owns a database', () => {
  // Docker seeds an empty named volume from the image's contents at the mount
  // point, ownership included. An image that does not create and own
  // /data/sqlite therefore gets a root:root volume on its first ever mount and
  // dies on SQLITE_CANTOPEN under `USER node` — invisible against the recycled
  // volume every pillar shares today, fatal the moment one moves to its own.
  //
  // The runtime smoke asserts this for real against a never-before-mounted
  // volume; this is the fast, docker-free half that names the fix.
  //
  // "Owns a database" is derived from shipping migrations rather than listed,
  // so a new pillar is held to the contract the moment its migrations land.
  const dbPillars = pillarsWith('Dockerfile', 'migrations');

  it('finds database-owning pillars (the derivation itself is not silently empty)', () => {
    expect(dbPillars.length).toBeGreaterThan(0);
  });

  it.each(dbPillars)('pillars/%s creates its data mount point in the runtime stage', (id) => {
    expect(runtimeStage(readDockerfile(id))).toMatch(/mkdir\s+-p\s+[^\n]*\/data\/sqlite/u);
  });

  it.each(dbPillars)('pillars/%s hands /data to the runtime user, not root', (id) => {
    expect(runtimeStage(readDockerfile(id))).toMatch(/chown\s+-R\s+\S+\s+\/data\b/u);
  });

  it.each(dbPillars)('pillars/%s defaults its database onto that mount point', (id) => {
    // Without this the image only boots when a deployer supplies a path: the
    // in-code default is ./data, and /app is root-owned.
    expect(runtimeStage(readDockerfile(id))).toMatch(
      /^\s*ENV\s+[A-Z_]*SQLITE_PATH=\/data\/sqlite\/\S+/mu
    );
  });
});
