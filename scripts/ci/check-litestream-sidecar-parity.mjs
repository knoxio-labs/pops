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
 * *its own* data volume (`pops-<id>-data` at `/data/sqlite`) — not merely a
 * config and a volume. It also checks that the replica-URL env var it reads
 * is named after its own id (`<ID>_LITESTREAM_REPLICA_URL`), with one named
 * exception: `registry-litestream` passes `CORE_LITESTREAM_REPLICA_URL`
 * instead, a known and documented mismatch (see infra/README.md, "litestream/")
 * that is tracked separately from this guard, not a wiring bug this guard
 * should flag.
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

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const LITESTREAM_DIR = join(repoRoot, 'infra', 'litestream');
const COMPOSE_PATH = join(repoRoot, 'infra', 'docker-compose.yml');

const SIDECAR_SUFFIX = '-litestream';
const CONFIG_TARGET = '/etc/litestream.yml';
const DATA_TARGET = '/data/sqlite';

/**
 * The one documented case where a sidecar's replica-URL env var does not
 * follow the `<ID>_LITESTREAM_REPLICA_URL` pattern: `registry-litestream`
 * passes `CORE_LITESTREAM_REPLICA_URL` (the pillar's pre-rename name),
 * recorded in infra/README.md ("litestream/") as a known mismatch tracked
 * on its own, not something this guard should report as wiring drift.
 * Keyed and valued explicitly rather than skipped by id, so a second
 * exception cannot be added without also stating its env var.
 *
 * @type {ReadonlyMap<string, string>}
 */
export const ENV_VAR_EXCEPTIONS = new Map([['registry', 'CORE_LITESTREAM_REPLICA_URL']]);

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
 * Split Compose source into one block per top-level `<id>-litestream:`
 * service — its id and its own body lines, unparsed. Everything downstream
 * (volume mounts, the env var name) reads from a block's `lines` rather than
 * re-scanning the whole file, so each sidecar is only ever compared against
 * its own body.
 *
 * @param {string} source
 * @returns {SidecarBlock[]}
 */
export function extractSidecarBlocks(source) {
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
      current = serviceName.endsWith(SIDECAR_SUFFIX)
        ? { id: serviceName.slice(0, -SIDECAR_SUFFIX.length), lines: [] }
        : null;
      if (current) blocks.push(current);
      continue;
    }

    current?.lines.push(line);
  }

  return blocks;
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
  /** @type {{ source?: string, target?: string } | null} */
  let longEntry = null;

  const flushLongEntry = () => {
    if (longEntry?.source !== undefined && longEntry.target !== undefined) {
      mounts.push({ source: longEntry.source, target: longEntry.target });
    }
    longEntry = null;
  };

  for (const line of lines) {
    if (/^ {4}volumes:\s*$/.test(line)) {
      inVolumes = true;
      continue;
    }
    if (!inVolumes) continue;

    // Back to 4-space indent with no leading `-` means the `volumes:` list
    // ended and the next key of the service body started.
    if (/^ {4}\S/.test(line)) {
      flushLongEntry();
      inVolumes = false;
      continue;
    }

    if (/^ {6}- type: (?:volume|bind)\s*$/.test(line)) {
      flushLongEntry();
      longEntry = {};
      continue;
    }

    const shortForm = /^ {6}- ([^\s:]+):([^:]+?)(?::\w+)?\s*$/.exec(line);
    const shortSource = shortForm?.[1];
    const shortTarget = shortForm?.[2];
    if (shortSource !== undefined && shortTarget !== undefined) {
      flushLongEntry();
      mounts.push({ source: shortSource, target: shortTarget });
      continue;
    }
    if (longEntry) {
      const sourceMatch = /^ {8}source: (\S+)\s*$/.exec(line);
      if (sourceMatch) longEntry.source = sourceMatch[1];
      const targetMatch = /^ {8}target: (\S+)\s*$/.exec(line);
      if (targetMatch) longEntry.target = targetMatch[1];
    }
  }
  flushLongEntry();

  return mounts;
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
 * (bar the documented `registry` exception) its own replica-URL env var.
 *
 * @param {string} id
 * @param {string[]} lines  The sidecar's own body lines, as produced by `extractSidecarBlocks`.
 * @returns {string[]} One human-readable violation per thing wrong; empty when clean.
 */
export function checkSidecarWiring(id, lines) {
  /** @type {string[]} */
  const violations = [];
  const mounts = extractVolumeMounts(lines);

  const expectedConfig = `./litestream/${id}.yml`;
  const configMount = mounts.find((mount) => mount.target === CONFIG_TARGET);
  if (!configMount) {
    violations.push(`missing a volume mounting ${CONFIG_TARGET}`);
  } else if (configMount.source !== expectedConfig) {
    violations.push(`mounts ${configMount.source} at ${CONFIG_TARGET}, expected ${expectedConfig}`);
  }

  const expectedDataVolume = `pops-${id}-data`;
  const dataMount = mounts.find((mount) => mount.target === DATA_TARGET);
  if (!dataMount) {
    violations.push(`missing a volume mounting ${DATA_TARGET}`);
  } else if (dataMount.source !== expectedDataVolume) {
    violations.push(`mounts ${dataMount.source} at ${DATA_TARGET}, expected ${expectedDataVolume}`);
  }

  const expectedEnvVar = ENV_VAR_EXCEPTIONS.get(id) ?? `${id.toUpperCase()}_LITESTREAM_REPLICA_URL`;
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
  'own config and data volume.';

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
 * a wrong data volume, a missing mount, honours the `registry` exception
 * while still failing an unlisted id with the identical shape, and that
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
    '      - pops-correct-data:/data/sqlite:ro',
    '      - ./litestream/correct.yml:/etc/litestream.yml:ro',
    '    environment:',
    '      CORRECT_LITESTREAM_REPLICA_URL: ${CORRECT_LITESTREAM_REPLICA_URL:-}',
    '  wrongconfig-litestream:',
    '    volumes:',
    '      - pops-wrongconfig-data:/data/sqlite:ro',
    '      - ./litestream/finance.yml:/etc/litestream.yml:ro',
    '    environment:',
    '      WRONGCONFIG_LITESTREAM_REPLICA_URL: ${WRONGCONFIG_LITESTREAM_REPLICA_URL:-}',
    '  wrongvolume-litestream:',
    '    volumes:',
    '      - pops-finance-data:/data/sqlite:ro',
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
    '      - pops-registry-data:/data/sqlite:ro',
    '      - ./litestream/registry.yml:/etc/litestream.yml:ro',
    '    environment:',
    '      CORE_LITESTREAM_REPLICA_URL: ${CORE_LITESTREAM_REPLICA_URL:-}',
    '  unlisted-litestream:',
    '    volumes:',
    '      - pops-unlisted-data:/data/sqlite:ro',
    '      - ./litestream/unlisted.yml:/etc/litestream.yml:ro',
    '    environment:',
    '      CORE_LITESTREAM_REPLICA_URL: ${CORE_LITESTREAM_REPLICA_URL:-}',
    '  longform-litestream:',
    '    volumes:',
    '      - type: volume',
    '        source: pops-longform-data',
    '        target: /data/sqlite',
    '        read_only: true',
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
  const wiringOf = (id) => checkSidecarWiring(id, wiringBlocks.get(id) ?? []);

  const correctOk = wiringOf('correct').length === 0;
  const wrongConfigOk = wiringOf('wrongconfig').some((v) => v.includes('litestream/finance.yml'));
  const wrongVolumeOk = wiringOf('wrongvolume').some((v) => v.includes('pops-finance-data'));
  const missingMountOk = wiringOf('missingmount').some((v) => v.includes('missing a volume'));
  const registryExceptionOk = wiringOf('registry').length === 0;
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
    registryExceptionOk &&
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
    console.error(`  honoured the registry env-var exception: ${registryExceptionOk}`);
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
        "another pillar's env var, reads long-form volumes, honours the registry exception, " +
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
    const violations = checkSidecarWiring(block.id, block.lines);
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
        'Either add a `<id>-litestream` service + `pops-<id>-data` volume to ' +
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
