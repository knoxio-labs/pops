#!/usr/bin/env node
/**
 * Litestream sidecar parity guard.
 *
 * Every reference config `infra/litestream/<id>.yml` is supposed to have a
 * matching `<id>-litestream` service in `infra/docker-compose.yml`, and every
 * `<id>-litestream` service is supposed to have a matching config. Nothing
 * enforced that pairing before this guard — `infra/litestream/purchases.yml`
 * sat complete, well-documented, and mounted nowhere. Several checks did read
 * the file (`infra-lint.yml`'s `yaml-lint` job, the control-character sweep,
 * the homelab-service isolation guard) and every one of them passes on a
 * config that replicates nothing: none asks whether anything mounts it.
 *
 * Id matching alone still leaves the deceptive middle case open: a sidecar
 * present under the right name but wired to somebody else's file. So this
 * guard also opens each matched sidecar's body and checks that it mounts
 * *its own* config (`./litestream/<id>.yml` at `/etc/litestream.yml`) and
 * the owning writer's declared data volume and relative database file — not merely a
 * config and a volume. It also checks that the replica-URL env var it reads
 * is named after its own id (`<ID>_LITESTREAM_REPLICA_URL`), the convention
 * used by its config.
 *
 * A config with no sidecar is the deceptive failure mode: it reads as "this
 * pillar is backed up" to anyone auditing the directory, including its own
 * header. An orphan sidecar (a service with no config) is the mirror case —
 * it would boot with nothing at `/etc/litestream.yml` to mount. A sidecar
 * mounting someone else's config or volume is the same deception one level
 * down: the name says one pillar, the mount says another, and only opening
 * the service body catches it.
 *
 * Only `infra/docker-compose.yml` is checked. `infra/docker-compose.dev.yml`
 * never carries `litestream` profile sidecars at all (see infra/README.md,
 * "prod vs dev") so it is out of scope for this pairing by design, not by
 * omission.
 *
 * Parsing is plain-text line scanning, not a YAML parser, so this script has
 * no dependency beyond `node:fs`/`node:path`/`node:url` and needs no
 * `pnpm install` to run — matching the other id-set guards in this directory
 * (e.g. check-known-pillars-coverage.mjs). It only looks at *top-level*
 * `services:` children (exactly two spaces of indent, `key:` with nothing
 * trailing) so a same-named key nested under `environment:` or similar can
 * never be mistaken for a service declaration. Volume entries are read in
 * both the short (`- source:target[:mode]`) and long (`- type: volume` /
 * `source:` / `target:` / `read_only:`) Compose forms, since either is valid
 * YAML even though every sidecar in this repo today uses the short form.
 *
 * Usage:
 *   node scripts/ci/check-litestream-sidecar-parity.mjs
 *   node scripts/ci/check-litestream-sidecar-parity.mjs --self-test
 *
 * Exit 0 = clean. Exit 1 = at least one drift or wiring mismatch. Exit 2 =
 * usage error.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  databaseReplicaViolations,
  declaredDatabasePaths,
  storageContains,
} from './litestream-storage.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const LITESTREAM_DIR = join(repoRoot, 'infra', 'litestream');
const COMPOSE_PATH = join(repoRoot, 'infra', 'docker-compose.yml');

const SIDECAR_SUFFIX = '-litestream';
const CONFIG_TARGET = '/etc/litestream.yml';

/**
 * Discover the ids of every Litestream reference config, from disk.
 *
 * @param {string} litestreamDir
 * @param {(dir: string) => string[]} listDir  Injectable for tests.
 * @returns {string[]} Sorted config ids (filename minus `.yml`).
 */
export function discoverConfigIds(litestreamDir, listDir = (d) => readdirSync(d)) {
  return listDir(litestreamDir)
    .filter((name) => name.endsWith('.yml'))
    .map((name) => name.slice(0, -'.yml'.length))
    .toSorted((a, b) => a.localeCompare(b));
}

/**
 * @typedef {object} SidecarBlock
 * @property {string} id     The service name with the `-litestream` suffix stripped.
 * @property {string[]} lines  The service's own body lines (everything indented under it).
 */

/**
 * Read all direct Compose service bodies for writer/backup mount correspondence without dependencies.
 * @param {string} source
 * @returns {{id: string, lines: string[]}[]}
 */
export function extractServiceBlocks(source) {
  const lines = source.split(/\r?\n/);
  let inServices = false;
  /** @type {SidecarBlock[]} */
  const blocks = [];
  /** @type {SidecarBlock | null} */
  let current = null;

  for (const line of lines) {
    if (/^services:\s*$/.test(line)) {
      inServices = true;
      continue;
    }
    if (!inServices) continue;
    if (/^\s*(?:#.*)?$/u.test(line)) {
      current?.lines.push(line);
      continue;
    }

    // A non-blank, non-comment line with no leading whitespace is the next
    // top-level key — the `services:` mapping has ended.
    if (/^[^\s#]/.test(line)) {
      inServices = false;
      current = null;
      continue;
    }

    const serviceKey = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    const serviceName = serviceKey?.[1];
    if (serviceName !== undefined) {
      current = { id: serviceName, lines: [] };
      blocks.push(current);
      continue;
    }

    if (/^ {2}\S/u.test(line)) throw new Error('Unsupported Compose service declaration');
    current?.lines.push(line);
  }

  return blocks;
}

/**
 * Project backup service ids and their own bodies from the same service scanner used for writers.
 * @param {string} source
 * @returns {SidecarBlock[]}
 */
export function extractSidecarBlocks(source) {
  return extractServiceBlocks(source)
    .filter((block) => block.id.endsWith(SIDECAR_SUFFIX))
    .map((block) => ({ id: block.id.slice(0, -SIDECAR_SUFFIX.length), lines: block.lines }));
}

/**
 * Extract every `<id>-litestream` service id declared as a direct child of
 * the top-level `services:` mapping, from Compose source text.
 *
 * @param {string} source
 * @returns {string[]} Sorted ids, with the `-litestream` suffix stripped.
 */
export function extractSidecarIds(source) {
  return extractSidecarBlocks(source)
    .map((block) => block.id)
    .toSorted((a, b) => a.localeCompare(b));
}

/**
 * @typedef {object} VolumeMount
 * @property {string} source  What is mounted — a named volume or a relative host path.
 * @property {string} target  Where it lands in the container.
 * @property {boolean} readOnly Whether the mount is read-only.
 * @property {boolean} isBind Whether this is a host bind rather than a named volume.
 */

/**
 * Read the `volumes:` list out of one service's body lines, in either the
 * short (`- source:target[:mode]`) or long (`- type: volume` with nested
 * `source:`/`target:`) Compose form.
 *
 * @param {string[]} lines  A service's own body lines, as produced by `extractSidecarBlocks`.
 * @returns {VolumeMount[]}
 */
export function extractVolumeMounts(lines) {
  /** @type {VolumeMount[]} */
  const mounts = [];
  let inVolumes = false;
  /** @type {{ source?: string, target?: string, readOnly?: boolean, isBind?: boolean } | null} */
  let longEntry = null;

  const flushLongEntry = () => {
    if (longEntry !== null) {
      if (longEntry.target === undefined) throw new Error('Invalid Compose volume target');
      mounts.push({
        source: longEntry.source ?? '',
        target: longEntry.target,
        readOnly: longEntry.readOnly === true,
        isBind: longEntry.isBind === true,
      });
    }
    longEntry = null;
  };

  for (const line of lines) {
    if (/^ {4}volumes:\s*$/.test(line)) {
      inVolumes = true;
      continue;
    }
    if (!inVolumes) {
      if (/^ {4}volumes:/u.test(line)) throw new Error('Unsupported Compose volumes declaration');
      continue;
    }

    // Back to 4-space indent with no leading `-` means the `volumes:` list
    // ended and the next key of the service body started.
    if (/^ {4}\S/.test(line)) {
      flushLongEntry();
      inVolumes = false;
      continue;
    }

    const typeMatch = /^ {6}- type: (\S+)\s*$/.exec(line);
    if (typeMatch) {
      flushLongEntry();
      longEntry = { isBind: typeMatch[1] !== 'volume' };
      continue;
    }

    const shortForm = /^ {6}- (.+):(\/[^:]*?)(?::([\w,]+))?\s*$/.exec(line);
    const shortSource = shortForm?.[1];
    const shortTarget = shortForm?.[2];
    if (shortSource !== undefined && shortTarget !== undefined) {
      flushLongEntry();
      mounts.push({
        source: shortSource,
        target: shortTarget,
        readOnly: (shortForm?.[3] ?? '').split(',').includes('ro'),
        isBind: /^[.~/]/u.test(shortSource),
      });
      continue;
    }
    if (/^ {6}-/u.test(line)) throw new Error('Unsupported Compose volume declaration');
    if (longEntry) {
      const sourceMatch = /^ {8}source: (\S+)\s*$/.exec(line);
      if (sourceMatch) {
        if (longEntry.source !== undefined) throw new Error('Duplicate Compose volume source');
        longEntry.source = sourceMatch[1];
        continue;
      }
      const targetMatch = /^ {8}target: (\S+)\s*$/.exec(line);
      if (targetMatch) {
        if (longEntry.target !== undefined) throw new Error('Duplicate Compose volume target');
        longEntry.target = targetMatch[1];
        continue;
      }
      const readOnlyMatch = /^ {8}read_only: (true|false)\s*$/.exec(line);
      if (readOnlyMatch) {
        if (longEntry.readOnly !== undefined) throw new Error('Duplicate Compose volume mode');
        longEntry.readOnly = readOnlyMatch[1] === 'true';
        continue;
      }
      if (line.trim() !== '' && !line.trimStart().startsWith('#')) {
        throw new Error('Unsupported Compose volume options');
      }
    }
  }
  flushLongEntry();

  return mounts;
}

/** @param {string} value @returns {string} */
function buildDockerfileScalar(value) {
  const single = /^'((?:[^']|'')*)'(?:\s+#.*)?$/u.exec(value);
  const double = /^("(?:[^"\\]|\\.)*")(?:\s+#.*)?$/u.exec(value);
  const plain = /^([A-Za-z0-9_./-]+)(?:\s+#.*)?$/u.exec(value);
  /** @type {unknown} */
  let path;
  if (single) path = single[1]?.replaceAll("''", "'");
  else if (double) path = JSON.parse(double[1] ?? '');
  else path = plain?.[1];
  if (
    typeof path !== 'string' ||
    !path.includes('/') ||
    !/^[A-Za-z0-9_./-]+$/u.test(path) ||
    path
      .replace(/^\.\//u, '')
      .split('/')
      .some((part) => part === '' || part === '.' || part === '..')
  )
    throw new Error('Unsupported Compose Dockerfile scalar');
  return path.replace(/^\.\//u, '');
}

/** @param {string[]} lines @returns {string | undefined} */
function declaredBuildDockerfile(lines) {
  let inBuild = false;
  let seenBuild = false;
  /** @type {string | undefined} */
  let dockerfile;
  for (const line of lines) {
    if (/^ {4}(?:['"]build['"]|<<):/u.test(line))
      throw new Error('Unsupported Compose build declaration');
    if (/^ {4}build:/u.test(line)) {
      if (seenBuild || !/^ {4}build:\s*(?:#.*)?$/u.test(line))
        throw new Error('Unsupported Compose build declaration');
      seenBuild = true;
      inBuild = true;
      continue;
    }
    if (/^ {4}\S/u.test(line)) inBuild = false;
    if (!inBuild) continue;
    const match = /^ {6}dockerfile:\s*(.*?)\s*$/u.exec(line);
    if (match) {
      if (dockerfile !== undefined) throw new Error('Duplicate Compose Dockerfile declaration');
      dockerfile = buildDockerfileScalar(match[1] ?? '');
    } else if (/^ {6}['"]?dockerfile/u.test(line)) {
      throw new Error('Unsupported Compose Dockerfile declaration');
    }
  }
  if (seenBuild && dockerfile === undefined)
    throw new Error('Missing explicit Compose Dockerfile declaration');
  return dockerfile;
}

/**
 * Discover owning images from their explicit build declaration and configured database storage.
 * Keep every writer's complete mounts, including shadows; a REST-only worker has no database mount.
 * @param {string} id
 * @param {string} composeSource
 * @param {string[]} paths The database paths declared by the owning Litestream config.
 * @returns {VolumeMount[][]}
 */
export function extractWriterMounts(id, composeSource, paths) {
  return extractServiceBlocks(composeSource)
    .filter((block) => !block.id.endsWith(SIDECAR_SUFFIX))
    .filter((block) => declaredBuildDockerfile(block.lines)?.startsWith(`pillars/${id}/`) === true)
    .flatMap((block) => {
      const mounts = extractVolumeMounts(block.lines);
      /** @type {Map<string, string>} */
      const variables = new Map();
      let inEnvironment = false;
      for (const line of block.lines) {
        if (/^ {4}environment:\s*$/u.test(line)) {
          inEnvironment = true;
          continue;
        }
        if (/^ {4}\S/u.test(line)) inEnvironment = false;
        const match = inEnvironment
          ? /^ {6}([A-Z0-9_]+):\s*([^#]*?)\s*(?:#.*)?$/u.exec(line)
          : null;
        if (match?.[1] !== undefined) {
          if (variables.has(match[1])) throw new Error('Duplicate Compose environment declaration');
          variables.set(match[1], (match[2] ?? '').replace(/^['"]|['"]$/gu, ''));
        }
      }
      const configured = variables.get(`${id.toUpperCase()}_SQLITE_PATH`);
      if (configured !== undefined && !paths.includes(configured))
        throw new Error(`${block.id} database path does not match its Litestream declaration`);
      const directory = variables.get(`${id.toUpperCase()}_DATA_DIR`);
      if (directory !== undefined && !paths.every((path) => storageContains(directory, path)))
        throw new Error(`${block.id} DATA directory does not match its Litestream declaration`);
      return configured !== undefined ||
        directory !== undefined ||
        mounts.some((mount) =>
          paths.some((path) => mount.target === path || storageContains(mount.target, path))
        )
        ? [mounts]
        : [];
    });
}

/**
 * Read the first key declared under a service's `environment:` mapping — the
 * only one every litestream sidecar declares (its replica-URL variable).
 *
 * @param {string[]} lines  A service's own body lines, as produced by `extractSidecarBlocks`.
 * @returns {string | undefined}
 */
export function extractEnvVarName(lines) {
  let inEnvironment = false;
  for (const line of lines) {
    if (/^ {4}environment:\s*$/.test(line)) {
      inEnvironment = true;
      continue;
    }
    if (!inEnvironment) continue;

    if (/^ {4}\S/.test(line)) {
      inEnvironment = false;
      continue;
    }

    const envKey = /^ {6}([A-Za-z0-9_]+):/.exec(line);
    if (envKey) return envKey[1];
  }
  return undefined;
}

/**
 * Check one sidecar's own body against what a sidecar named `<id>-litestream`
 * is supposed to mount and read — its own config, its own data volume, and
 * its own replica-URL env var.
 *
 * @param {string} id
 * @param {string[]} lines  The sidecar's own body lines, as produced by `extractSidecarBlocks`.
 * @param {string} configSource The actual owning Litestream config.
 * @param {VolumeMount[][]} writers Each owning writer's complete mount set.
 * @returns {string[]} One human-readable violation per thing wrong; empty when clean.
 */
export function checkSidecarWiring(id, lines, configSource, writers) {
  /** @type {string[]} */
  const violations = [];
  const mounts = extractVolumeMounts(lines);

  const expectedConfig = `./litestream/${id}.yml`;
  const configMounts = mounts.filter((mount) => mount.target === CONFIG_TARGET);
  const configMount = configMounts[0];
  if (!configMount) {
    violations.push(`missing a volume mounting ${CONFIG_TARGET}`);
  } else if (
    configMounts.length !== 1 ||
    configMount.source !== expectedConfig ||
    !configMount.readOnly
  ) {
    violations.push(`mounts ${configMount.source} at ${CONFIG_TARGET}, expected ${expectedConfig}`);
  }

  try {
    violations.push(
      ...databaseReplicaViolations(id, declaredDatabasePaths(configSource), mounts, writers)
    );
  } catch (error) {
    violations.push(
      error instanceof Error ? error.message : 'Invalid Litestream database declaration'
    );
  }

  const expectedEnvVar = `${id.toUpperCase()}_LITESTREAM_REPLICA_URL`;
  const actualEnvVar = extractEnvVarName(lines);
  if (actualEnvVar !== expectedEnvVar) {
    violations.push(
      `reads its replica URL from ${actualEnvVar ?? '(no environment var found)'}, ` +
        `expected ${expectedEnvVar}`
    );
  }

  return violations;
}

/**
 * @typedef {object} Drift
 * @property {string[]} missingSidecar  Config ids with no matching `<id>-litestream` service.
 * @property {string[]} orphanSidecar   `<id>-litestream` service ids with no matching config.
 */

/**
 * Pure diff — exported for tests.
 *
 * @param {string[]} configIds
 * @param {string[]} sidecarIds
 * @returns {Drift}
 */
export function findDrift(configIds, sidecarIds) {
  const sidecars = new Set(sidecarIds);
  const configs = new Set(configIds);
  return {
    missingSidecar: configIds.filter((id) => !sidecars.has(id)),
    orphanSidecar: sidecarIds.filter((id) => !configs.has(id)),
  };
}

const USAGE =
  'Usage: node scripts/ci/check-litestream-sidecar-parity.mjs [--self-test]\n' +
  'Fails if an infra/litestream/<id>.yml has no <id>-litestream service in ' +
  'infra/docker-compose.yml, vice versa, or a matched sidecar does not mount its ' +
  'own config and data volume or pass through its replica-URL variable.';

/**
 * @typedef {{ kind: 'help' } | { kind: 'self-test' } | { kind: 'run' } | { kind: 'error', message: string }} ParsedArgs
 */

/**
 * Classify argv into what `main` should do next — a pure function so
 * `--self-test` can exercise the unknown-argument path directly, without
 * spawning a subprocess to observe an exit code.
 *
 * This script takes no argument other than `--help`/`-h` and `--self-test`.
 * Anything else — a typo'd flag, a stray positional — is an error: falling
 * through to a normal run would make e.g. `--self-tst` silently run the
 * real parity check instead of the self-test, and a clean tree would make
 * that read as "the self-test passed".
 *
 * @param {string[]} args
 * @returns {ParsedArgs}
 */
export function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { kind: 'help' };

  const unrecognised = args.filter((arg) => arg !== '--self-test');
  if (unrecognised.length > 0) {
    return { kind: 'error', message: `Unrecognised argument: ${unrecognised[0]}` };
  }

  return args.includes('--self-test') ? { kind: 'self-test' } : { kind: 'run' };
}

/**
 * Self-test: prove the detector flags a synthetic missing/orphan id and
 * passes a clean fixture, that the wiring check catches a wrong config path,
 * a wrong data volume, a missing mount, a wrong replica-URL variable, and that
 * argument parsing recognises `--help`, `--self-test`, a plain run, and
 * rejects anything else. CI runs this so a regression that neuters the
 * guard is caught without relying on a real tree violation.
 *
 * @returns {boolean}
 */
function selfTest() {
  const clean = findDrift(['finance', 'media'], ['finance', 'media']);
  const cleanOk = clean.missingSidecar.length === 0 && clean.orphanSidecar.length === 0;

  const withMissing = findDrift(['finance', 'media', 'purchases'], ['finance', 'media']);
  const missingOk =
    withMissing.missingSidecar.length === 1 &&
    withMissing.missingSidecar[0] === 'purchases' &&
    withMissing.orphanSidecar.length === 0;

  const withOrphan = findDrift(['finance'], ['finance', 'ghost']);
  const orphanOk =
    withOrphan.orphanSidecar.length === 1 &&
    withOrphan.orphanSidecar[0] === 'ghost' &&
    withOrphan.missingSidecar.length === 0;

  const composeFixture = [
    'services:',
    '  finance-api:',
    '    image: ghcr.io/knoxio-labs/pops-finance:main',
    '    environment:',
    '      # A nested key sharing the sidecar suffix must never be mistaken',
    '      # for a top-level service declaration.',
    '      SOMETHING-litestream: fake',
    '  finance-litestream:',
    '    image: litestream/litestream:0.3.13',
    '  ghost-litestream:',
    '    image: litestream/litestream:0.3.13',
    'networks:',
    '  backend:',
    '    driver: bridge',
  ].join('\n');
  const extracted = extractSidecarIds(composeFixture);
  const extractOk =
    extracted.length === 2 && extracted.includes('finance') && extracted.includes('ghost');

  const wiringFixture = [
    'services:',
    '  correct-litestream:',
    '    volumes:',
    '      - pops-correct-data:/data/sqlite',
    '      - ./litestream/correct.yml:/etc/litestream.yml:ro',
    '    environment:',
    '      CORRECT_LITESTREAM_REPLICA_URL: ${CORRECT_LITESTREAM_REPLICA_URL:-}',
    '  wrongconfig-litestream:',
    '    volumes:',
    '      - pops-wrongconfig-data:/data/sqlite',
    '      - ./litestream/finance.yml:/etc/litestream.yml:ro',
    '    environment:',
    '      WRONGCONFIG_LITESTREAM_REPLICA_URL: ${WRONGCONFIG_LITESTREAM_REPLICA_URL:-}',
    '  wrongvolume-litestream:',
    '    volumes:',
    '      - pops-finance-data:/data/sqlite',
    '      - ./litestream/wrongvolume.yml:/etc/litestream.yml:ro',
    '    environment:',
    '      WRONGVOLUME_LITESTREAM_REPLICA_URL: ${WRONGVOLUME_LITESTREAM_REPLICA_URL:-}',
    '  missingmount-litestream:',
    '    volumes:',
    '      - ./litestream/missingmount.yml:/etc/litestream.yml:ro',
    '    environment:',
    '      MISSINGMOUNT_LITESTREAM_REPLICA_URL: ${MISSINGMOUNT_LITESTREAM_REPLICA_URL:-}',
    '  registry-litestream:',
    '    volumes:',
    '      - pops-registry-data:/data/sqlite',
    '      - ./litestream/registry.yml:/etc/litestream.yml:ro',
    '    environment:',
    '      CORE_LITESTREAM_REPLICA_URL: ${CORE_LITESTREAM_REPLICA_URL:-}',
    '  unlisted-litestream:',
    '    volumes:',
    '      - pops-unlisted-data:/data/sqlite',
    '      - ./litestream/unlisted.yml:/etc/litestream.yml:ro',
    '    environment:',
    '      CORE_LITESTREAM_REPLICA_URL: ${CORE_LITESTREAM_REPLICA_URL:-}',
    '  longform-litestream:',
    '    volumes:',
    '      - type: volume',
    '        source: pops-longform-data',
    '        target: /data/sqlite',
    '        read_only: false',
    '      - type: bind',
    '        source: ./litestream/longform.yml',
    '        target: /etc/litestream.yml',
    '        read_only: true',
    '    environment:',
    '      LONGFORM_LITESTREAM_REPLICA_URL: ${LONGFORM_LITESTREAM_REPLICA_URL:-}',
  ].join('\n');
  const wiringBlocks = new Map(
    extractSidecarBlocks(wiringFixture).map((block) => [block.id, block.lines])
  );
  /** @param {string} id */
  const wiringOf = (id) =>
    checkSidecarWiring(id, wiringBlocks.get(id) ?? [], `dbs:\n  - path: /data/sqlite/${id}.db\n`, [
      [{ source: `pops-${id}-data`, target: '/data/sqlite', readOnly: false, isBind: false }],
    ]);

  const correctOk = wiringOf('correct').length === 0;
  const wrongConfigOk = wiringOf('wrongconfig').some((v) => v.includes('litestream/finance.yml'));
  const wrongVolumeOk = wiringOf('wrongvolume').some((v) => v.includes('pops-finance-data'));
  const missingMountOk = wiringOf('missingmount').some((v) => v.includes('missing a volume'));
  const registryEnvMismatchOk = wiringOf('registry').some((v) =>
    v.includes('expected REGISTRY_LITESTREAM_REPLICA_URL')
  );
  const unlistedStillFailsOk = wiringOf('unlisted').some((v) =>
    v.includes('UNLISTED_LITESTREAM_REPLICA_URL')
  );
  const longFormOk = wiringOf('longform').length === 0;

  const helpOk = parseArgs(['--help']).kind === 'help' && parseArgs(['-h']).kind === 'help';
  const selfTestOk = parseArgs(['--self-test']).kind === 'self-test';
  const runOk = parseArgs([]).kind === 'run';
  const badArg = parseArgs(['--self-tst']);
  const unknownArgOk =
    badArg.kind === 'error' && badArg.message === 'Unrecognised argument: --self-tst';

  const ok =
    cleanOk &&
    missingOk &&
    orphanOk &&
    extractOk &&
    correctOk &&
    wrongConfigOk &&
    wrongVolumeOk &&
    missingMountOk &&
    registryEnvMismatchOk &&
    unlistedStillFailsOk &&
    longFormOk &&
    helpOk &&
    selfTestOk &&
    runOk &&
    unknownArgOk;
  if (!ok) {
    console.error('SELF-TEST FAILED — guard did not behave as expected:');
    console.error(`  clean fixture passed:                    ${cleanOk}`);
    console.error(`  caught config with no sidecar:           ${missingOk}`);
    console.error(`  caught sidecar with no config:            ${orphanOk}`);
    console.error(`  extracted only top-level services:       ${extractOk}`);
    console.error(`  passed a correctly wired sidecar:        ${correctOk}`);
    console.error(`  caught a sidecar mounting the wrong config: ${wrongConfigOk}`);
    console.error(`  caught a sidecar mounting the wrong volume: ${wrongVolumeOk}`);
    console.error(`  caught a sidecar missing a mount:        ${missingMountOk}`);
    console.error(`  caught registry using the legacy env var: ${registryEnvMismatchOk}`);
    console.error(`  still failed an unlisted id, same shape: ${unlistedStillFailsOk}`);
    console.error(`  read long-form volume syntax:            ${longFormOk}`);
    console.error(`  recognised --help/-h:                    ${helpOk}`);
    console.error(`  recognised --self-test:                  ${selfTestOk}`);
    console.error(`  recognised a plain run:                  ${runOk}`);
    console.error(`  rejected an unrecognised argument:       ${unknownArgOk}`);
  } else {
    console.log(
      'self-test OK — guard catches a config with no sidecar, a sidecar with no config, a ' +
        'sidecar mounting the wrong config or volume, a missing mount, an unlisted id passing ' +
        "another pillar's env var, flags registry's legacy env var, reads long-form volumes, " +
        'and rejects an unrecognised argument.'
    );
  }
  return ok;
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.kind === 'error') {
    console.error(`${parsed.message}\n${USAGE}`);
    process.exit(2);
  }
  if (parsed.kind === 'help') {
    console.log(USAGE);
    process.exit(0);
  }
  if (parsed.kind === 'self-test') {
    process.exit(selfTest() ? 0 : 1);
  }

  const configIds = discoverConfigIds(LITESTREAM_DIR);
  const composeSource = readFileSync(COMPOSE_PATH, 'utf8');
  const sidecarBlocks = extractSidecarBlocks(composeSource);
  const sidecarIds = sidecarBlocks.map((block) => block.id).toSorted((a, b) => a.localeCompare(b));
  console.log(
    `Scanned ${configIds.length} litestream config(s) against ${sidecarIds.length} ` +
      '<id>-litestream service(s) in infra/docker-compose.yml.'
  );

  const { missingSidecar, orphanSidecar } = findDrift(configIds, sidecarIds);

  /** @type {Map<string, string[]>} */
  const wiringViolations = new Map();
  for (const block of sidecarBlocks) {
    const configPath = join(LITESTREAM_DIR, `${block.id}.yml`);
    const configSource = configIds.includes(block.id) ? readFileSync(configPath, 'utf8') : '';
    const violations = checkSidecarWiring(
      block.id,
      block.lines,
      configSource,
      extractWriterMounts(block.id, composeSource, declaredDatabasePaths(configSource))
    );
    if (violations.length > 0) wiringViolations.set(block.id, violations);
  }

  const clean =
    missingSidecar.length === 0 && orphanSidecar.length === 0 && wiringViolations.size === 0;
  if (clean) {
    console.log(
      'OK — every litestream config has a sidecar, every sidecar has a config, and every ' +
        'matched sidecar mounts its own config and data volume.'
    );
    process.exit(0);
  }

  if (missingSidecar.length > 0) {
    console.error(
      `FAIL — config(s) with no matching sidecar service: ${missingSidecar.join(', ')}. ` +
        'Either add a `<id>-litestream` service matching its owning writer storage to ' +
        'infra/docker-compose.yml, or delete the orphaned infra/litestream/<id>.yml ' +
        'with the reason recorded.'
    );
  }
  if (orphanSidecar.length > 0) {
    console.error(
      `FAIL — sidecar service(s) with no matching config: ${orphanSidecar.join(', ')}. ` +
        'Add infra/litestream/<id>.yml, or remove the orphaned <id>-litestream service.'
    );
  }
  for (const [id, violations] of wiringViolations) {
    console.error(`FAIL — ${id}-litestream ${violations.join('; ')}.`);
  }
  process.exit(1);
}

if (import.meta.main) {
  main();
}
