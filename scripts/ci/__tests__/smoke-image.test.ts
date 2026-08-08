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

interface WorkspacePackage {
  readonly name?: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

function readPackageJson(path: string): WorkspacePackage {
  return JSON.parse(readFileSync(path, 'utf8')) as WorkspacePackage;
}

/** Every workspace member, by package name. Mirrors `packages:` in pnpm-workspace.yaml. */
function workspaceMembers(): Map<string, WorkspacePackage> {
  const members = new Map<string, WorkspacePackage>();
  for (const group of ['pillars', 'libs']) {
    for (const entry of readdirSync(join(repoRoot, group), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidates = [join(repoRoot, group, entry.name)];
      if (group === 'pillars') {
        for (const nested of readdirSync(join(repoRoot, group, entry.name), {
          withFileTypes: true,
        })) {
          if (nested.isDirectory()) candidates.push(join(repoRoot, group, entry.name, nested.name));
        }
      }
      for (const dir of candidates) {
        const manifest = join(dir, 'package.json');
        if (!existsSync(manifest)) continue;
        const pkg = readPackageJson(manifest);
        if (pkg.name !== undefined) members.set(pkg.name, pkg);
      }
    }
  }
  return members;
}

/**
 * The workspace packages `pnpm install --filter "<name>..."` selects: the
 * package plus the transitive closure of its workspace dependencies, dev
 * dependencies included — which is what pnpm's `...` suffix resolves to, and
 * why a lib that only tests against better-sqlite3 still drags it into an
 * image.
 */
function selectedWorkspacePackages(
  entry: string,
  members: ReadonlyMap<string, WorkspacePackage>
): Set<string> {
  const selected = new Set<string>();
  const pending = [entry];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || selected.has(current)) continue;
    const pkg = members.get(current);
    if (pkg === undefined) continue;
    selected.add(current);
    for (const field of ['dependencies', 'devDependencies'] as const) {
      for (const dep of Object.keys(pkg[field] ?? {})) {
        if (members.has(dep)) pending.push(dep);
      }
    }
  }
  return selected;
}

/** Pillar ids whose image installs better-sqlite3, derived rather than listed. */
function pillarsInstallingBetterSqlite3(): string[] {
  const members = workspaceMembers();
  return pillarsWith('Dockerfile', 'package.json').filter((id) => {
    const name = readPackageJson(join(repoRoot, 'pillars', id, 'package.json')).name;
    if (name === undefined) return false;
    return [...selectedWorkspacePackages(name, members)].some((selected) => {
      const pkg = members.get(selected);
      return (
        pkg?.dependencies?.['better-sqlite3'] !== undefined ||
        pkg?.devDependencies?.['better-sqlite3'] !== undefined
      );
    });
  });
}

/** Everything before the final `FROM` — the stages that build but do not ship. */
function builderStages(dockerfile: string): string {
  return dockerfile.slice(0, dockerfile.length - runtimeStage(dockerfile).length);
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

/** What node-gyp needs on Debian and Alpine alike to build a native addon. */
const NODE_GYP_PACKAGES = ['python3', 'make', 'g++'] as const;

function installsNodeGypToolchain(line: string): boolean {
  if (!/\b(?:apt-get install|apk add)\b/u.test(line)) return false;
  const tokens = new Set(line.split(/\s+/u));
  return NODE_GYP_PACKAGES.every((pkg) => tokens.has(pkg));
}

/**
 * Line index of the first INSTRUCTION matching the predicate, comments blanked
 * rather than dropped so the index still refers to the real line. These
 * Dockerfiles narrate their own `pnpm install --filter …` in a header comment,
 * which an unfiltered scan reads as the install itself.
 */
function lineIndexMatching(text: string, predicate: (line: string) => boolean): number {
  return text
    .split('\n')
    .map((line) => (/^\s*#/u.test(line) ? '' : line))
    .findIndex(predicate);
}

describe('the native-build fallback, for every pillar image that installs better-sqlite3', () => {
  // better-sqlite3's install script is `prebuild-install || node-gyp rebuild`.
  // On a bare `node:24-*` base the second half cannot run, so fetching the
  // prebuilt binary is an undeclared hard requirement of the build: a GitHub
  // releases hiccup, a rate limit, or a release that ships no prebuild for the
  // Node/arch pair does not degrade to a compile, it fails the image — and it
  // fails with `Could not find any Python installation to use`, which names
  // neither the real cause nor the fix.
  //
  // The toolchain in the builder stage is what makes that `||` real. The
  // prebuild remains the fast path; the compile is what happens when it is
  // missing, at the cost of builder-stage size and a few seconds of apt.
  //
  // Which images are exposed is DERIVED from the workspace graph, not listed:
  // each Dockerfile installs `--filter "@pops/<id>..."`, whose selection is the
  // transitive workspace closure. That is why `shell` is in here despite owning
  // no database — its closure spans six pillars that do.
  const nativePillars = pillarsInstallingBetterSqlite3();

  it('finds better-sqlite3 images (the derivation itself is not silently empty)', () => {
    expect(nativePillars.length).toBeGreaterThan(0);
  });

  it('derives shell too, whose closure pulls in database pillars it does not own', () => {
    // Guards the derivation itself: a naive "ships migrations" rule — the one
    // the fresh-volume contract above can afford — would miss this image.
    expect(nativePillars).toContain('shell');
    expect(existsSync(join(repoRoot, 'pillars', 'shell', 'migrations'))).toBe(false);
  });

  it.each(nativePillars)('pillars/%s installs a node-gyp toolchain to build with', (id) => {
    expect(
      lineIndexMatching(builderStages(readDockerfile(id)), installsNodeGypToolchain)
    ).toBeGreaterThanOrEqual(0);
  });

  it.each(nativePillars)('pillars/%s installs it before the install that needs it', (id) => {
    const builder = builderStages(readDockerfile(id));
    const toolchain = lineIndexMatching(builder, installsNodeGypToolchain);
    const install = lineIndexMatching(builder, (line) => /\bpnpm install\b/u.test(line));
    expect(install).toBeGreaterThan(toolchain);
  });

  it.each(nativePillars)('pillars/%s keeps the toolchain out of the shipped image', (id) => {
    // The whole size argument for this rests on the toolchain never leaving the
    // builder. A runtime stage that grew a compiler would pass every assertion
    // above and quietly add a few hundred MB to what deployers pull.
    expect(lineIndexMatching(runtimeStage(readDockerfile(id)), installsNodeGypToolchain)).toBe(-1);
  });
});

describe('installsNodeGypToolchain', () => {
  it('accepts the Debian and Alpine forms', () => {
    expect(
      installsNodeGypToolchain(
        'RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \\'
      )
    ).toBe(true);
    expect(installsNodeGypToolchain('RUN apk add --no-cache python3 make g++')).toBe(true);
  });

  it('rejects a partial toolchain — a compiler with no Python still cannot run node-gyp', () => {
    expect(installsNodeGypToolchain('RUN apk add --no-cache make g++')).toBe(false);
    expect(installsNodeGypToolchain('RUN apt-get install -y python3 make')).toBe(false);
  });

  it('does not mistake the runtime stage curl install for a toolchain', () => {
    expect(
      installsNodeGypToolchain(
        'RUN apt-get update && apt-get install -y --no-install-recommends curl'
      )
    ).toBe(false);
  });

  it('does not match a mere mention of the packages outside an install', () => {
    expect(installsNodeGypToolchain('# needs python3 make g++ to compile')).toBe(false);
  });
});

describe('lineIndexMatching', () => {
  it('ignores comments, so a header narrating `pnpm install` is not the install', () => {
    const dockerfile = [
      'FROM node:24-slim AS builder',
      '# installs with `pnpm install --filter "@pops/food..."`',
      'RUN apt-get install -y python3 make g++',
      'RUN corepack enable && pnpm install --frozen-lockfile',
      '',
    ].join('\n');
    expect(lineIndexMatching(dockerfile, (line) => /\bpnpm install\b/u.test(line))).toBe(3);
  });

  it('returns -1 when nothing matches', () => {
    expect(lineIndexMatching('FROM x\n', installsNodeGypToolchain)).toBe(-1);
  });
});

describe('builderStages', () => {
  it('excludes the final stage, so a runtime install is not read as a builder one', () => {
    const dockerfile = [
      'FROM node:24-slim AS builder',
      'RUN apt-get install -y python3 make g++',
      'FROM node:24-slim',
      'RUN apt-get install -y curl',
      '',
    ].join('\n');
    expect(builderStages(dockerfile)).toContain('python3');
    expect(builderStages(dockerfile)).not.toContain('curl');
  });

  it('is empty for a single-stage Dockerfile', () => {
    expect(builderStages('FROM nginx:1.31.3-alpine\nEXPOSE 80\n')).toBe('');
  });
});
