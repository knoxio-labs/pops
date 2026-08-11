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
 * This guard matches ids and nothing else. It does not verify that a sidecar
 * mounts *its own* config, nor that the `pops-<id>-data` volume it reads
 * exists — a sidecar wired to the wrong file still passes here.
 *
 * A config with no sidecar is the deceptive failure mode: it reads as "this
 * pillar is backed up" to anyone auditing the directory, including its own
 * header. An orphan sidecar (a service with no config) is the mirror case —
 * it would boot with nothing at `/etc/litestream.yml` to mount.
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
 * never be mistaken for a service declaration.
 *
 * Usage:
 *   node scripts/ci/check-litestream-sidecar-parity.mjs
 *   node scripts/ci/check-litestream-sidecar-parity.mjs --self-test
 *
 * Exit 0 = clean. Exit 1 = at least one drift. Exit 2 = usage error.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const LITESTREAM_DIR = join(repoRoot, 'infra', 'litestream');
const COMPOSE_PATH = join(repoRoot, 'infra', 'docker-compose.yml');

const SIDECAR_SUFFIX = '-litestream';

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
 * Extract every `<id>-litestream` service id declared as a direct child of
 * the top-level `services:` mapping, from Compose source text.
 *
 * @param {string} source
 * @returns {string[]} Sorted ids, with the `-litestream` suffix stripped.
 */
export function extractSidecarIds(source) {
  const lines = source.split(/\r?\n/);
  let inServices = false;
  /** @type {string[]} */
  const ids = [];

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
      continue;
    }

    const serviceKey = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (serviceKey && serviceKey[1].endsWith(SIDECAR_SUFFIX)) {
      ids.push(serviceKey[1].slice(0, -SIDECAR_SUFFIX.length));
    }
  }

  return ids.toSorted((a, b) => a.localeCompare(b));
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

/**
 * Self-test: prove the detector flags a synthetic missing/orphan id and
 * passes a clean fixture. CI runs this so a regression that neuters the
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

  const ok = cleanOk && missingOk && orphanOk && extractOk;
  if (!ok) {
    console.error('SELF-TEST FAILED — guard did not behave as expected:');
    console.error(`  clean fixture passed:              ${cleanOk}`);
    console.error(`  caught config with no sidecar:      ${missingOk}`);
    console.error(`  caught sidecar with no config:       ${orphanOk}`);
    console.error(`  extracted only top-level services:   ${extractOk}`);
  } else {
    console.log(
      'self-test OK — guard catches a config with no sidecar, a sidecar with no config, ' +
        'and ignores a nested key sharing the sidecar suffix.'
    );
  }
  return ok;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/ci/check-litestream-sidecar-parity.mjs [--self-test]\n' +
        'Fails if an infra/litestream/<id>.yml has no <id>-litestream service in ' +
        'infra/docker-compose.yml, or vice versa.'
    );
    process.exit(0);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const configIds = discoverConfigIds(LITESTREAM_DIR);
  const composeSource = readFileSync(COMPOSE_PATH, 'utf8');
  const sidecarIds = extractSidecarIds(composeSource);
  console.log(
    `Scanned ${configIds.length} litestream config(s) against ${sidecarIds.length} ` +
      '<id>-litestream service(s) in infra/docker-compose.yml.'
  );

  const { missingSidecar, orphanSidecar } = findDrift(configIds, sidecarIds);
  if (missingSidecar.length === 0 && orphanSidecar.length === 0) {
    console.log('OK — every litestream config has a sidecar, and every sidecar has a config.');
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
  process.exit(1);
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '')) {
  main();
}
