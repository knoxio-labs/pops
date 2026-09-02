import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  collectStreams,
  dataMountsForDockerfile,
  forcesRevalidation,
  freshVolumeName,
  freshnessProbePaths,
  mountSlug,
  normalizeVolumeEntry,
  parseExposedPort,
  parseRuntimeBaseImage,
  planSmoke,
  planVolumes,
  resolveHealthPath,
  runtimeStage,
} from '../smoke-image.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const productionCompose = readFileSync(join(repoRoot, 'infra', 'docker-compose.yml'), 'utf8');

/** Pillar ids whose directory contains every one of the named entries. */
function pillarsWith(...entries: readonly string[]): string[] {
  return readdirSync(join(repoRoot, 'pillars'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((id) => entries.every((path) => existsSync(join(repoRoot, 'pillars', id, path))));
}

/**
 * Every image the tree ships, as a repo-relative Dockerfile path.
 *
 * A pillar is not one image: `pillars/design` ships a static nginx image for
 * the playground and `Dockerfile.api` for the comment API it writes to, since
 * one image cannot be both. Keying these assertions on the pillar id would
 * hold the wrong file to each contract — and would leave the second image
 * checked by nothing. Matches the discovery in `docker-build.yml`.
 */
function pillarImages(): string[] {
  return pillarsWith('Dockerfile').flatMap((id) =>
    readdirSync(join(repoRoot, 'pillars', id))
      .filter((name) => name === 'Dockerfile' || name.startsWith('Dockerfile.'))
      .sort()
      .map((name) => `pillars/${id}/${name}`)
  );
}

function readDockerfile(dockerfilePath: string): string {
  return readFileSync(join(repoRoot, dockerfilePath), 'utf8');
}

/** The `/data/...` volumes production compose mounts onto one image, read-write. */
function productionMounts(dockerfilePath: string): string[] {
  return dataMountsForDockerfile(productionCompose, dockerfilePath);
}

/**
 * Images that own a database, derived from what production actually mounts
 * onto them rather than from whether their pillar ships migrations.
 *
 * The two agreed while every pillar shipped exactly one image. They stop
 * agreeing the moment a pillar ships two: `pillars/design` ships migrations
 * and its static image mounts nothing, so the migrations rule would demand a
 * `/data/sqlite` mount point of an nginx image that never opens a database.
 */
function databaseImages(): string[] {
  return pillarImages().filter((path) => productionMounts(path).includes('/data/sqlite'));
}

interface WorkspacePackage {
  readonly name?: string;
  readonly scripts?: Readonly<Record<string, string>>;
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

/** Images that install better-sqlite3, derived rather than listed. */
function imagesInstallingBetterSqlite3(): string[] {
  const members = workspaceMembers();
  return pillarImages().filter((path) => {
    const manifest = join(repoRoot, dirname(path), 'package.json');
    if (!existsSync(manifest)) return false;
    const name = readPackageJson(manifest).name;
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

/**
 * The `/data/...` directories the shipped stage creates — the ones a fresh
 * named volume can inherit an owner from. Comments go first (these Dockerfiles
 * narrate `mkdirSync` in prose), then line continuations are folded, then each
 * `&&`-separated command is read on its own so a trailing `chown -R node:node
 * /data` is not mistaken for a directory the image creates.
 */
function runtimeDataDirs(dockerfile: string): string[] {
  const stage = runtimeStage(dockerfile)
    .split('\n')
    .filter((line) => !/^\s*#/u.test(line))
    .join('\n')
    .replace(/\\\r?\n/gu, ' ');
  const dirs = new Set<string>();
  for (const command of stage.split(/&&|;|\n/u)) {
    const args = /^\s*(?:RUN\s+)?mkdir\b(.*)$/u.exec(command)?.[1];
    if (args === undefined) continue;
    for (const token of args.split(/\s+/u)) {
      if (token.startsWith('/data/')) dirs.add(token);
    }
  }
  return [...dirs].toSorted();
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

  it('tags a second data volume, so a leaked one names the mount it covered', () => {
    expect(freshVolumeName('pillars/media/Dockerfile', 'data-media-images')).toMatch(
      /^pops-smoke-media-data-media-images-[0-9a-f]{8}$/u
    );
  });
});

describe('mountSlug', () => {
  it('flattens a mount path into a docker-safe volume name fragment', () => {
    expect(mountSlug('/data/sqlite')).toBe('data-sqlite');
    expect(mountSlug('/data/media/images')).toBe('data-media-images');
  });
});

describe('planVolumes', () => {
  it('gives every mount its own never-before-used volume', () => {
    const plan = planVolumes('pillars/media/Dockerfile', ['/data/sqlite', '/data/media/images']);
    expect(plan.map((v) => v.path)).toEqual(['/data/sqlite', '/data/media/images']);
    expect(new Set(plan.map((v) => v.name)).size).toBe(2);
  });

  it('plans nothing for an image production mounts nothing onto', () => {
    expect(planVolumes('pillars/docs/Dockerfile', [])).toEqual([]);
  });
});

describe('normalizeVolumeEntry', () => {
  it('reads the short form', () => {
    expect(normalizeVolumeEntry('sqlite-data:/data/sqlite')).toEqual({
      target: '/data/sqlite',
      readOnly: false,
      isBind: false,
    });
  });

  it('reads an anonymous volume, which has no source segment at all', () => {
    // `entry.split(':')[1]` is `undefined` here and the mount vanishes.
    expect(normalizeVolumeEntry('/data/media/images')).toEqual({
      target: '/data/media/images',
      readOnly: false,
      isBind: false,
    });
  });

  it('reads an access mode', () => {
    expect(normalizeVolumeEntry('pops-registry-data:/data/sqlite:ro')?.readOnly).toBe(true);
    expect(normalizeVolumeEntry('sqlite-data:/data/sqlite:rw')?.readOnly).toBe(false);
    expect(normalizeVolumeEntry('sqlite-data:/data/sqlite:ro,z')?.readOnly).toBe(true);
    expect(normalizeVolumeEntry('/data/anon:ro')).toEqual({
      target: '/data/anon',
      readOnly: true,
      isBind: false,
    });
  });

  it('parses from the right, so a colon in the source does not shift the target', () => {
    // `split(':')[1]` reads `name` as the container path here.
    expect(normalizeVolumeEntry('weird:name:/data/sqlite')?.target).toBe('/data/sqlite');
    expect(normalizeVolumeEntry('C:\\hostdir:/data/sqlite:ro')).toEqual({
      target: '/data/sqlite',
      readOnly: true,
      isBind: true,
    });
  });

  it('recognises a host bind, which no fresh volume models', () => {
    expect(normalizeVolumeEntry('./litestream/registry.yml:/etc/litestream.yml:ro')?.isBind).toBe(
      true
    );
    expect(normalizeVolumeEntry('/var/run/docker.sock:/var/run/docker.sock')?.isBind).toBe(true);
    expect(normalizeVolumeEntry('~/state:/data/sqlite')?.isBind).toBe(true);
  });

  it('reads the long form, including its explicit type', () => {
    expect(normalizeVolumeEntry({ target: '/data/sqlite' })).toEqual({
      target: '/data/sqlite',
      readOnly: false,
      isBind: false,
    });
    expect(
      normalizeVolumeEntry({ type: 'volume', target: '/data/sqlite', read_only: true })
    ).toEqual({ target: '/data/sqlite', readOnly: true, isBind: false });
    expect(normalizeVolumeEntry({ type: 'bind', target: '/data/sqlite' })?.isBind).toBe(true);
  });

  it('rejects an entry that names no absolute container path', () => {
    expect(normalizeVolumeEntry('just-a-name')).toBeUndefined();
    expect(normalizeVolumeEntry('')).toBeUndefined();
  });
});

/** A one-service compose manifest mounting exactly `entries`. */
function composeFixture(entries: readonly string[]): string {
  return [
    'services:',
    '  fixture-api:',
    '    image: example/fixture',
    '    build:',
    '      context: ..',
    '      dockerfile: pillars/fixture/Dockerfile',
    '    volumes:',
    ...entries.map((entry) => `      - ${entry}`),
    '',
  ].join('\n');
}

function fixtureMounts(entries: readonly string[]): string[] {
  return dataMountsForDockerfile(composeFixture(entries), 'pillars/fixture/Dockerfile');
}

describe('dataMountsForDockerfile — Compose short forms', () => {
  it('keeps an anonymous volume, whose short form carries no colon', () => {
    expect(fixtureMounts(['/data/media/images'])).toEqual(['/data/media/images']);
  });

  it('drops a read-only mount, which the image is never asked to write', () => {
    expect(fixtureMounts(['sqlite-data:/data/sqlite:ro'])).toEqual([]);
    expect(fixtureMounts(['sqlite-data:/data/sqlite:rw'])).toEqual(['/data/sqlite']);
  });

  it('keeps a mount whose source contains a colon', () => {
    expect(fixtureMounts(['weird:name:/data/sqlite'])).toEqual(['/data/sqlite']);
  });

  it('drops a host bind, whose ownership the image never supplies', () => {
    expect(fixtureMounts(['./seed:/data/sqlite'])).toEqual([]);
  });

  it('drops a mount outside /data', () => {
    expect(fixtureMounts(['certs:/etc/ssl/private', 'sqlite-data:/data/sqlite'])).toEqual([
      '/data/sqlite',
    ]);
  });

  it('unions and sorts across every service that builds the same Dockerfile', () => {
    const compose = [
      'services:',
      '  fixture-api:',
      '    build:',
      '      dockerfile: pillars/fixture/Dockerfile',
      '    volumes:',
      '      - sqlite-data:/data/sqlite',
      '      - ingest-data:/data/fixture/ingest',
      '  fixture-worker:',
      '    build:',
      '      dockerfile: ./pillars/fixture/Dockerfile',
      '    volumes:',
      '      - ingest-data:/data/fixture/ingest',
      '  unrelated-api:',
      '    build:',
      '      dockerfile: pillars/other/Dockerfile',
      '    volumes:',
      '      - other-data:/data/other',
      '',
    ].join('\n');
    expect(dataMountsForDockerfile(compose, 'pillars/fixture/Dockerfile')).toEqual([
      '/data/fixture/ingest',
      '/data/sqlite',
    ]);
  });

  it('refuses a service that builds without naming its Dockerfile', () => {
    // Compose would infer `<context>/Dockerfile`. Inferring it here means
    // guessing how the context resolves, and a wrong guess mounts nothing and
    // calls that a pass.
    const compose = [
      'services:',
      '  fixture-api:',
      '    build: ..',
      '    volumes:',
      '      - sqlite-data:/data/sqlite',
      '',
    ].join('\n');
    expect(() => dataMountsForDockerfile(compose, 'pillars/fixture/Dockerfile')).toThrow(
      /fixture-api/u
    );
  });

  it('derives nothing for a service compose consumes as a published image', () => {
    const compose = ['services:', '  fixture-api:', '    image: example/fixture', ''].join('\n');
    expect(dataMountsForDockerfile(compose, 'pillars/fixture/Dockerfile')).toEqual([]);
  });

  it('refuses a compose shape it does not understand rather than deriving nothing', () => {
    // A silently empty derivation is a gate that reports success for a mount
    // it never looked at — the failure mode this whole harness exists to deny.
    const compose = [
      'services:',
      '  fixture-api:',
      '    build:',
      '      dockerfile: pillars/fixture/Dockerfile',
      '    volumes: sqlite-data:/data/sqlite',
      '',
    ].join('\n');
    expect(() => dataMountsForDockerfile(compose, 'pillars/fixture/Dockerfile')).toThrow();
  });
});

describe('dataMountsForDockerfile — YAML `#` is only a comment outside quotes', () => {
  // Truncating a line at its first `#` deletes valid volumes. Each case is
  // asserted against the same manifest written without the `#`, so the test
  // states the equivalence rather than restating a hand-computed answer.
  it('keeps a source containing `#` inside single quotes', () => {
    expect(fixtureMounts(["'weird#name:/data/sqlite'"])).toEqual(
      fixtureMounts(['weirdname:/data/sqlite'])
    );
  });

  it('keeps a source containing `#` inside double quotes', () => {
    expect(fixtureMounts(['"weird#name:/data/sqlite"'])).toEqual(
      fixtureMounts(['weirdname:/data/sqlite'])
    );
  });

  it('keeps a plain scalar containing `#`, which starts no comment either', () => {
    expect(fixtureMounts(['weird#name:/data/sqlite'])).toEqual(
      fixtureMounts(['weirdname:/data/sqlite'])
    );
  });

  it('drops a real trailing comment without dropping its mount', () => {
    expect(fixtureMounts(['sqlite-data:/data/sqlite # the shared database volume'])).toEqual(
      fixtureMounts(['sqlite-data:/data/sqlite'])
    );
  });

  it('ignores a whole-line comment between mounts', () => {
    const commented = [
      'services:',
      '  fixture-api:',
      '    build:',
      '      dockerfile: pillars/fixture/Dockerfile',
      '    volumes:',
      '      # the shared database volume',
      '      - sqlite-data:/data/sqlite',
      '      - images-data:/data/fixture/images',
      '',
    ].join('\n');
    expect(dataMountsForDockerfile(commented, 'pillars/fixture/Dockerfile')).toEqual(
      fixtureMounts(['sqlite-data:/data/sqlite', 'images-data:/data/fixture/images'])
    );
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

describe('freshnessProbePaths', () => {
  it('probes both entry routes for nginx-served frontends', () => {
    expect(freshnessProbePaths('nginx:1.31.3-alpine')).toEqual(['/', '/deep/link/smoke-probe']);
  });

  it('probes a deep path that no build can ship as a real file', () => {
    const [, deepLink] = freshnessProbePaths('nginx:1.31.3-alpine');
    expect(deepLink).toMatch(/^\/.+\/.+/u);
  });

  it('asks nothing of application images, which serve no entry document', () => {
    expect(freshnessProbePaths('node:24-slim')).toEqual([]);
  });

  it('does not treat a lookalike name as nginx', () => {
    expect(freshnessProbePaths('nginxinc-unofficial:1')).toEqual([]);
  });
});

describe('forcesRevalidation', () => {
  it('rejects a missing header — the state that hands the decision to heuristics', () => {
    expect(forcesRevalidation(null)).toBe(false);
  });

  it('accepts the directives that require a check-back', () => {
    expect(forcesRevalidation('no-cache, must-revalidate')).toBe(true);
    expect(forcesRevalidation('no-store')).toBe(true);
    expect(forcesRevalidation('public, max-age=0, must-revalidate')).toBe(true);
  });

  it('rejects a policy that lets a stale entry document be reused', () => {
    expect(forcesRevalidation('public, immutable')).toBe(false);
    expect(forcesRevalidation('public, max-age=31536000')).toBe(false);
    expect(forcesRevalidation('must-revalidate')).toBe(false);
  });

  it('does not accept a directive that merely contains one as a substring', () => {
    expect(forcesRevalidation('max-age=3600')).toBe(false);
    expect(forcesRevalidation('stale-while-revalidate=60')).toBe(false);
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
  const images = pillarImages();

  it('finds Dockerfiles to check (the discovery itself is not silently empty)', () => {
    expect(images.length).toBeGreaterThan(0);
  });

  it('discovers a pillar’s second image, not just its primary one', () => {
    // Guards the discovery itself: keyed on the pillar id, every assertion
    // below would silently skip whichever image is not named `Dockerfile`.
    expect(images).toContain('pillars/design/Dockerfile.api');
  });

  it.each(images)('%s yields a usable smoke plan', (path) => {
    const plan = planSmoke(readDockerfile(path));
    expect(plan.port).toBeGreaterThan(0);
    expect(plan.healthPath.startsWith('/')).toBe(true);
  });
});

describe('the deploy step every Node pillar image depends on', () => {
  // Regression guard for the pnpm 11 `--legacy` deploy: it writes relative
  // `@pops/*` symlinks that escape /app/deploy, so the image builds clean and
  // the container dies on its first import. The runtime smoke is the real
  // gate; this is the fast, docker-free half that names the fix.
  it.each(pillarImages())('%s does not use `pnpm deploy --legacy`', (path) => {
    const deployLines = readDockerfile(path)
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
  const dbImages = databaseImages();

  it('finds database-owning images (the derivation itself is not silently empty)', () => {
    expect(dbImages.length).toBeGreaterThan(0);
  });

  it('holds a pillar’s API image to the contract and not its static one', () => {
    expect(dbImages).toContain('pillars/design/Dockerfile.api');
    expect(dbImages).not.toContain('pillars/design/Dockerfile');
  });

  it.each(dbImages)('%s creates its data mount point in the runtime stage', (path) => {
    expect(runtimeStage(readDockerfile(path))).toMatch(/mkdir\s+-p\s+[^\n]*\/data\/sqlite/u);
  });

  it.each(dbImages)('%s hands /data to the runtime user, not root', (path) => {
    expect(runtimeStage(readDockerfile(path))).toMatch(/chown\s+-R\s+\S+\s+\/data\b/u);
  });

  it.each(dbImages)('%s defaults its database onto that mount point', (path) => {
    // Without this the image only boots when a deployer supplies a path: the
    // in-code default is ./data, and /app is root-owned.
    expect(runtimeStage(readDockerfile(path))).toMatch(
      /^\s*ENV\s+[A-Z_]*SQLITE_PATH=\/data\/sqlite\/\S+/mu
    );
  });
});

/** Every source path a Dockerfile `COPY`s, flags and destination dropped. */
function copiedSources(dockerfile: string): Set<string> {
  const sources = new Set<string>();
  for (const line of dockerfile.replace(/\\\r?\n/gu, ' ').split('\n')) {
    const args = /^\s*COPY\s+(.*)$/iu.exec(line)?.[1];
    if (args === undefined) continue;
    const tokens = args.split(/\s+/u).filter((token) => !token.startsWith('--'));
    for (const source of tokens.slice(0, -1)) sources.add(source);
  }
  return sources;
}

/**
 * Whether a Dockerfile's `COPY` sources bring `path` into the image, named
 * outright or swept in by a directory copy (`COPY libs/sdk/ ./libs/sdk/`).
 */
function copiesPath(sources: ReadonlySet<string>, path: string): boolean {
  return [...sources].some(
    (source) => source === path || path.startsWith(source.endsWith('/') ? source : `${source}/`)
  );
}

/** The tsconfigs a package's `build` script compiles against. */
function tsconfigsBuildScriptNeeds(pkg: WorkspacePackage): string[] {
  return [...(pkg.scripts?.build ?? '').matchAll(/\btsc\s+-[pb]\s+(\S+\.json)/gu)]
    .map((match) => match[1])
    .filter((tsconfig): tsconfig is string => tsconfig !== undefined);
}

/** The workspace directories a Dockerfile builds, read off the manifests it copies. */
function workspaceDirsBuiltBy(dockerfile: string): string[] {
  return [...copiedSources(dockerfile)]
    .map((source) => /^((?:pillars|libs)\/[^/]+)\/package\.json$/u.exec(source)?.[1])
    .filter((dir): dir is string => dir !== undefined);
}

describe('copiedSources', () => {
  it('reads every source off a multi-source COPY and drops the destination', () => {
    expect([...copiedSources('COPY package.json pnpm-lock.yaml tsconfig.base.json ./\n')]).toEqual([
      'package.json',
      'pnpm-lock.yaml',
      'tsconfig.base.json',
    ]);
  });

  it('drops flags, so --from and --chown are not read as sources', () => {
    expect([...copiedSources('COPY --from=builder --chown=node:node /app/deploy ./\n')]).toEqual([
      '/app/deploy',
    ]);
  });
});

describe('tsconfigsBuildScriptNeeds', () => {
  it('reads both the -p and -b forms, and nothing from a script with neither', () => {
    expect(tsconfigsBuildScriptNeeds({ scripts: { build: 'tsc -p tsconfig.build.json' } })).toEqual(
      ['tsconfig.build.json']
    );
    expect(
      tsconfigsBuildScriptNeeds({
        scripts: { build: 'tsc -b tsconfig.build.json && tsx scripts/generate-openapi.ts' },
      })
    ).toEqual(['tsconfig.build.json']);
    expect(tsconfigsBuildScriptNeeds({ scripts: { build: 'vite build' } })).toEqual([]);
    expect(tsconfigsBuildScriptNeeds({})).toEqual([]);
  });
});

describe('the tsconfigs each image compiles against, for every pillar Dockerfile', () => {
  // A `build` script that names a tsconfig the Dockerfile never COPYs fails
  // the image build with `TS5058: The specified path does not exist`, and
  // nothing outside this workflow notices: changing a pillar's build script or
  // adding its tsconfig.build.json touches no path in docker-build's trigger
  // filter, so the image that can no longer be built is not rebuilt to find
  // out. That is how `documents`, `mcp` and `orchestrator` reached main
  // unbuildable. Derived from the manifests each Dockerfile copies, so a
  // pillar is covered without being listed.
  const cases = pillarImages().flatMap((path) => {
    const dockerfile = readDockerfile(path);
    const copied = copiedSources(dockerfile);
    return workspaceDirsBuiltBy(dockerfile).flatMap((dir) =>
      tsconfigsBuildScriptNeeds(readPackageJson(join(repoRoot, dir, 'package.json'))).map(
        (tsconfig) => ({ id: path, dir, tsconfig, copied })
      )
    );
  });

  it('finds Dockerfiles that compile TypeScript (the derivation is not silently empty)', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases)('pillars/$id copies $dir/$tsconfig, which its build script names', (testCase) => {
    expect(copiesPath(testCase.copied, `${testCase.dir}/${testCase.tsconfig}`)).toBe(true);
  });
});

describe('copiesPath', () => {
  it('accepts the file named outright', () => {
    expect(
      copiesPath(new Set(['libs/sdk/tsconfig.build.json']), 'libs/sdk/tsconfig.build.json')
    ).toBe(true);
  });

  it('accepts a directory copy that sweeps the file in', () => {
    expect(copiesPath(new Set(['libs/sdk/']), 'libs/sdk/tsconfig.build.json')).toBe(true);
    expect(copiesPath(new Set(['libs/sdk']), 'libs/sdk/tsconfig.build.json')).toBe(true);
  });

  it('does not accept a sibling whose name is a prefix', () => {
    expect(copiesPath(new Set(['libs/sdk-legacy/']), 'libs/sdk/tsconfig.build.json')).toBe(false);
    expect(copiesPath(new Set(['libs/sdk/tsconfig.json']), 'libs/sdk/tsconfig.build.json')).toBe(
      false
    );
  });
});

describe('runtimeDataDirs', () => {
  it('reads every path off one `mkdir -p`', () => {
    expect(
      runtimeDataDirs('FROM node:24-slim\nRUN mkdir -p /data/sqlite /data/media/images\n')
    ).toEqual(['/data/media/images', '/data/sqlite']);
  });

  it('does not read a chown target as a directory the image creates', () => {
    expect(
      runtimeDataDirs('FROM node:24-slim\nRUN mkdir -p /data/sqlite && chown -R node:node /data\n')
    ).toEqual(['/data/sqlite']);
  });

  it('folds line continuations', () => {
    const dockerfile = [
      'FROM debian:bookworm-slim',
      'RUN apt-get update \\',
      '    && mkdir -p /data/sqlite \\',
      '    && chown -R contacts:contacts /data',
      '',
    ].join('\n');
    expect(runtimeDataDirs(dockerfile)).toEqual(['/data/sqlite']);
  });

  it('ignores prose about mkdir and paths created only in the builder', () => {
    const dockerfile = [
      'FROM node:24-slim AS builder',
      'RUN mkdir -p /data/leftover',
      'FROM node:24-slim',
      '# `mkdirSync` no-ops on /data/sqlite when the volume is already there',
      'USER node',
      '',
    ].join('\n');
    expect(runtimeDataDirs(dockerfile)).toEqual([]);
  });
});

describe('what production mounts and what the image creates, for every pillar Dockerfile', () => {
  // The runtime smoke asserts this for real, against never-before-mounted
  // volumes; this is the fast, docker-free half, and it is two-way on purpose.
  //
  // Forward: a `/data/...` volume compose mounts that the image never creates
  // is a root-owned directory on that volume's first mount in production.
  //
  // Backward: a `/data/...` directory the image creates that compose mounts
  // nothing onto is either a volume someone forgot to declare — state written
  // into the container layer and lost on the next redeploy — or a `mkdir` for
  // a mount that no longer exists.
  it.each(pillarImages())('%s creates exactly what compose mounts onto it', (path) => {
    expect(runtimeDataDirs(readDockerfile(path))).toEqual(productionMounts(path));
  });
});

describe('the mount set derived from production compose', () => {
  // Guards the derivation against silently narrowing to nothing: a parser bug,
  // a schema mismatch or a renamed compose key would leave every assertion
  // above vacuously true, and the smoke would report success on a mount it
  // never touched.
  const derived = new Map(pillarImages().map((path) => [path, productionMounts(path)]));

  /**
   * The backward direction of the derivation above: a pillar that ships
   * migrations must have SOME image mounting a database, even though which of
   * its images that is no longer follows from the pillar id.
   */
  it('covers every pillar that owns a database', () => {
    for (const id of pillarsWith('Dockerfile', 'migrations')) {
      const mounts = pillarImages()
        .filter((path) => path.startsWith(`pillars/${id}/`))
        .flatMap((path) => derived.get(path) ?? []);
      expect(mounts).toContain('/data/sqlite');
    }
  });

  it('reaches the lazily-written second volumes, which no health probe proves', () => {
    expect(derived.get('pillars/media/Dockerfile')).toContain('/data/media/images');
    expect(derived.get('pillars/food/Dockerfile')).toContain('/data/food/ingest');
    expect(derived.get('pillars/cerebrum/Dockerfile')).toContain('/data/cerebrum/engrams');
  });

  it('mounts nothing on the images that own no state', () => {
    for (const id of ['docs', 'shell', 'mcp', 'documents', 'orchestrator', 'design']) {
      expect(derived.get(`pillars/${id}/Dockerfile`)).toEqual([]);
    }
  });

  it('excludes the read-only replica mounts litestream reads through', () => {
    expect([...derived.values()].flat()).not.toContain('/etc/litestream.yml');
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
  // no database — its closure reaches pillars that do.
  const nativeImages = imagesInstallingBetterSqlite3();

  it('finds better-sqlite3 images (the derivation itself is not silently empty)', () => {
    expect(nativeImages.length).toBeGreaterThan(0);
  });

  it('derives shell too, whose closure pulls in database pillars it does not own', () => {
    // Guards the derivation itself: a naive "ships migrations" rule — the one
    // the fresh-volume contract above can afford — would miss this image.
    expect(nativeImages).toContain('pillars/shell/Dockerfile');
    expect(existsSync(join(repoRoot, 'pillars', 'shell', 'migrations'))).toBe(false);
  });

  it.each(nativeImages)('%s installs a node-gyp toolchain to build with', (path) => {
    expect(
      lineIndexMatching(builderStages(readDockerfile(path)), installsNodeGypToolchain)
    ).toBeGreaterThanOrEqual(0);
  });

  it.each(nativeImages)('%s installs it before the install that needs it', (path) => {
    const builder = builderStages(readDockerfile(path));
    const toolchain = lineIndexMatching(builder, installsNodeGypToolchain);
    const install = lineIndexMatching(builder, (line) => /\bpnpm install\b/u.test(line));
    expect(install).toBeGreaterThan(toolchain);
  });

  it.each(nativeImages)('%s keeps the toolchain out of the shipped image', (path) => {
    // The whole size argument for this rests on the toolchain never leaving the
    // builder. A runtime stage that grew a compiler would pass every assertion
    // above and quietly add a few hundred MB to what deployers pull.
    expect(lineIndexMatching(runtimeStage(readDockerfile(path)), installsNodeGypToolchain)).toBe(
      -1
    );
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
