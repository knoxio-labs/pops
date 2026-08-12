#!/usr/bin/env node
/**
 * ADR-039 Invariant 4 guard — the pops-vs-infra service boundary.
 *
 * home-assistant, mosquitto, zigbee2mqtt, and matter are **homelab
 * infrastructure, not pops**. Per ADR-039 (docs/architecture/adr-039-pillar-
 * isolation.md) Invariant 4 they never enter pops's compose topology, its
 * backup scope, or its per-pillar Litestream convention — the homelab-infra
 * repo owns and backs them up with its OWN scripts, timers, retention budget,
 * and bucket. A pops pillar MAY talk to an upstream Home Assistant over its
 * API (a future `ha-bridge` pillar), but it must never *run / compose / own*
 * HA/MQTT/Zigbee2MQTT/Matter as a pops service.
 *
 * This guard encodes that invariant as an enforceable check. It scans the pops
 * infra source-of-truth manifests — Docker Compose files and Litestream
 * replication configs anywhere in this repo — and fails if any of them stands
 * up one of those homelab services as a pops service. A dependency-cruiser rule
 * cannot catch this: these are Docker services and backup targets, not TS
 * module imports, so the boundary is invisible to import-graph tooling.
 *
 * A service is flagged when a manifest:
 *   - declares a Compose service key named for a forbidden service
 *     (`home-assistant:`, `mosquitto:`, `zigbee2mqtt:`, `matter:`, …), or
 *   - pins a forbidden service's container image (`image: eclipse-mosquitto`,
 *     `image: ghcr.io/home-assistant/home-assistant`, `koenkk/zigbee2mqtt`,
 *     `ghcr.io/home-assistant-libs/python-matter-server`, …), or
 *   - names a container for one (`container_name: mosquitto`), or
 *   - brings one under the pops Litestream convention (a litestream config
 *     whose db path or filename is one of these services).
 *
 * The scan only inspects structural manifest lines (service keys, `image:`,
 * `container_name:`, litestream `path:`), so prose that merely *mentions* Home
 * Assistant (e.g. a comment explaining the boundary) is never a false positive.
 *
 * **Tier B guard**: the manifests go through a real YAML parser, so the job
 * that runs it installs the workspace first. See the tier amendment in
 * [ADR-045](../../docs/architecture/adr-045-guards-must-prove-they-report.md).
 * Every spelling of a declaration — flow mapping, quoted key, trailing comment,
 * a `#` inside an image coordinate — collapses to the same tree before this
 * guard looks at it, so there is no longer a legal shape that reads as a clean
 * manifest. A manifest that does not PARSE is still reported as a finding
 * rather than skipped: scanning nothing and printing `OK` is the failure
 * ADR-045 exists to end.
 *
 * Findings carry the YAML key path (`services.home-assistant`) rather than a
 * line number. A parser knows structure, not byte offsets, and the path is what
 * identifies the declaration once the file has been reformatted.
 *
 * It does NOT validate against `compose-schema.mjs`, and that is deliberate.
 * That schema describes `infra/docker-compose.yml` for callers that need
 * specific fields out of it; this guard sweeps EVERY compose-shaped file in the
 * tree and must report on documents it does not recognise rather than reject
 * them. Routing it through a `zod` object would also strip the two keys it
 * exists to find — `image` and `container_name` are not in that shape — which
 * would leave the guard scanning nothing and printing `OK`.
 *
 * Usage:
 *   node scripts/ci/check-homelab-service-isolation.mjs
 *   node scripts/ci/check-homelab-service-isolation.mjs --self-test
 *
 * Exit 0 = boundary intact. Exit 1 = a homelab service leaked into pops infra.
 * Exit 2 = usage error.
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatPath, isMapping, parseYaml, scalarText, walkMappings } from './config-parse.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.next', 'coverage', '.git']);

/**
 * @typedef {object} ForbiddenService
 * @property {string} id     Canonical short id used in messages.
 * @property {string} label  Human label for the failure message.
 * @property {RegExp} nameRe  Matches a bare service/container/db identifier.
 * @property {RegExp} imageRe Matches a Docker image reference (with/without registry + tag).
 */

/**
 * The four homelab services ADR-039 Invariant 4 keeps out of pops. Patterns
 * cover the common upstream image coordinates and the canonical Compose
 * service names, including the frequent `z2m` alias for zigbee2mqtt.
 *
 * @type {ForbiddenService[]}
 */
export const FORBIDDEN_SERVICES = [
  {
    id: 'home-assistant',
    label: 'Home Assistant',
    nameRe: /^(home-?assistant|hass|hassio|hass-io)$/i,
    imageRe: /(^|\/)(home-?assistant|hass|hassio|homeassistant\/home-assistant)(:|@|$)/i,
  },
  {
    id: 'mosquitto',
    label: 'Mosquitto MQTT broker',
    nameRe: /^(eclipse-)?mosquitto$/i,
    imageRe: /(^|\/)(eclipse-)?mosquitto(:|@|$)/i,
  },
  {
    id: 'zigbee2mqtt',
    label: 'Zigbee2MQTT',
    nameRe: /^(zigbee2mqtt|z2m)$/i,
    imageRe: /(^|\/)zigbee2mqtt(:|@|$)/i,
  },
  {
    id: 'matter',
    label: 'Matter server',
    nameRe: /^(matter|matter-server|matterbridge)$/i,
    imageRe: /(^|\/)((python-)?matter-server|matterbridge)(:|@|$)/i,
  },
];

/**
 * Match a bare identifier (a Compose service key, container name, or the
 * basename/db-name of a litestream target) against the forbidden set.
 *
 * @param {string} token
 * @returns {ForbiddenService | undefined}
 */
export function matchName(token) {
  const t = token.trim().toLowerCase();
  return FORBIDDEN_SERVICES.find((s) => s.nameRe.test(t));
}

/**
 * Match a Docker image reference against the forbidden set.
 *
 * @param {string} image
 * @returns {ForbiddenService | undefined}
 */
export function matchImage(image) {
  const ref = image.trim().replace(/^["']|["']$/g, '');
  return FORBIDDEN_SERVICES.find((s) => s.imageRe.test(ref));
}

/**
 * @typedef {object} Violation
 * @property {string} file     Repo-relative manifest path.
 * @property {string} path     YAML key path, or `<filename>` for a filename-level hit.
 * @property {string} service  Forbidden service label.
 * @property {string} evidence What was found (the offending declaration).
 * @property {'service-key' | 'image' | 'container_name' | 'litestream-path' | 'litestream-file' | 'unreadable-shape'} kind
 */

/**
 * Parse a manifest, or turn the parse failure into the one finding kind that
 * says "I could not look at this".
 *
 * @param {string} file
 * @param {string} text
 * @returns {{ doc: unknown } | { violation: Violation }}
 */
function parseManifest(file, text) {
  try {
    return { doc: parseYaml(text, file) };
  } catch (error) {
    return {
      violation: {
        file,
        path: '<document>',
        service: 'unknown',
        evidence: error instanceof Error ? error.message : String(error),
        kind: 'unreadable-shape',
      },
    };
  }
}

/**
 * Scan one Compose manifest for forbidden service declarations.
 *
 * Only *immediate* children of `services` count as service declarations — a
 * nested `matter:` environment key or a `mosquitto:` network is not a service.
 * `image` and `container_name` are matched wherever they appear, since either
 * one stands the service up regardless of what its key is called.
 *
 * @param {string} file  Repo-relative path (for reporting).
 * @param {string} text  File contents.
 * @returns {Violation[]}
 */
export function scanCompose(file, text) {
  const parsed = parseManifest(file, text);
  if ('violation' in parsed) return [parsed.violation];

  /** @type {Violation[]} */
  const out = [];
  const doc = parsed.doc;

  if (isMapping(doc) && doc.services !== undefined) {
    if (!isMapping(doc.services)) {
      out.push({
        file,
        path: 'services',
        service: 'unknown',
        evidence: `\`services\` is a ${Array.isArray(doc.services) ? 'sequence' : typeof doc.services}, not a mapping of service names`,
        kind: 'unreadable-shape',
      });
    } else {
      for (const name of Object.keys(doc.services)) {
        const hit = matchName(name);
        if (hit) {
          out.push({
            file,
            path: `services.${name}`,
            service: hit.label,
            evidence: `service "${name}"`,
            kind: 'service-key',
          });
        }
      }
    }
  }

  for (const entry of walkMappings(doc)) {
    if (entry.key !== 'image' && entry.key !== 'container_name') continue;
    const value = scalarText(entry.value);
    if (value === undefined) {
      // Skipping it would mean an `image:` the guard cannot read counts as no
      // image at all — the leak stays and the manifest reports clean.
      out.push({
        file,
        path: formatPath(entry.path),
        service: 'unknown',
        evidence: `\`${entry.key}\` is not a single value, so it cannot be matched`,
        kind: 'unreadable-shape',
      });
      continue;
    }
    const hit = entry.key === 'image' ? matchImage(value) : matchName(value);
    if (!hit) continue;
    out.push({
      file,
      path: formatPath(entry.path),
      service: hit.label,
      evidence: `${entry.key} ${value}`,
      kind: entry.key === 'image' ? 'image' : 'container_name',
    });
  }

  return out;
}

/**
 * Scan a Litestream config: the file name itself and every replicated db
 * `path` must not name a forbidden homelab service — Invariant 4 keeps them
 * off the pops per-pillar Litestream convention entirely.
 *
 * @param {string} file  Repo-relative path.
 * @param {string} text  File contents.
 * @returns {Violation[]}
 */
export function scanLitestream(file, text) {
  /** @type {Violation[]} */
  const out = [];

  const stem = basename(file).replace(/\.ya?ml$/i, '');
  const fileHit = matchName(stem);
  if (fileHit) {
    out.push({
      file,
      path: '<filename>',
      service: fileHit.label,
      evidence: `litestream config named "${basename(file)}"`,
      kind: 'litestream-file',
    });
  }

  const parsed = parseManifest(file, text);
  if ('violation' in parsed) return [...out, parsed.violation];

  for (const entry of walkMappings(parsed.doc)) {
    if (entry.key !== 'path') continue;
    const value = scalarText(entry.value);
    if (value === undefined) {
      out.push({
        file,
        path: formatPath(entry.path),
        service: 'unknown',
        evidence: '`path` is not a single value, so the replicated db cannot be identified',
        kind: 'unreadable-shape',
      });
      continue;
    }
    const dbName = basename(value).replace(/\.(db|sqlite3?|litestream)$/i, '');
    const hit = matchName(dbName);
    if (!hit) continue;
    out.push({
      file,
      path: formatPath(entry.path),
      service: hit.label,
      evidence: `litestream db path ${value}`,
      kind: 'litestream-path',
    });
  }
  return out;
}

/** @param {string} name @returns {boolean} */
function isComposeFile(name) {
  return /(^|[.-])(docker-)?compose(\.[\w-]+)?\.ya?ml$/i.test(name);
}

/** @param {string} file @param {string} name @returns {boolean} */
function isLitestreamFile(file, name) {
  if (/(^|[.-])litestream(\.[\w-]+)?\.ya?ml$/i.test(name)) return true;
  return /(^|\/)litestream\//.test(file) && /\.ya?ml$/i.test(name);
}

/**
 * @typedef {object} Manifest
 * @property {string} path Absolute path.
 * @property {'compose' | 'litestream'} kind
 */

/**
 * Walk the tree and collect every Compose + Litestream manifest.
 *
 * @param {string} root
 * @returns {Manifest[]}
 */
export function discoverManifests(root) {
  /** @type {Manifest[]} */
  const found = [];

  /** @param {string} dir */
  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        // Skip every hidden dir (.cache, .venv, .idea, …) except .github, which
        // can hold workflow-embedded compose fragments.
        if (entry.name.startsWith('.') && entry.name !== '.github') continue;
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = relative(root, full);
      if (isLitestreamFile(rel, entry.name)) found.push({ path: full, kind: 'litestream' });
      else if (isComposeFile(entry.name)) found.push({ path: full, kind: 'compose' });
    }
  }

  walk(root);
  return found.toSorted((a, b) => a.path.localeCompare(b.path));
}

/**
 * Run the appropriate scanner over every manifest.
 *
 * @param {Manifest[]} manifests
 * @param {(p: string) => string} read
 * @param {string} [root]  Root used to relativise reported paths.
 * @returns {Violation[]}
 */
export function findViolations(manifests, read, root = repoRoot) {
  /** @type {Violation[]} */
  const out = [];
  for (const m of manifests) {
    const rel = m.path.startsWith(`${root}/`) ? m.path.slice(root.length + 1) : m.path;
    const text = read(m.path);
    out.push(...(m.kind === 'compose' ? scanCompose(rel, text) : scanLitestream(rel, text)));
  }
  return out;
}

/**
 * Self-test: prove the scanners flag every leak shape (service key, image,
 * container_name, litestream path + filename) AND that a legitimate pops
 * manifest — plus prose that merely mentions the boundary — stays clean.
 *
 * @returns {boolean}
 */
function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), 'homelab-iso-'));
  try {
    const leakyCompose = [
      'services:',
      '  finance-api:',
      '    image: ghcr.io/knoxio/pops-finance:main',
      '  home-assistant:',
      '    image: ghcr.io/home-assistant/home-assistant:stable',
      '  broker:',
      '    image: eclipse-mosquitto:2',
      '    container_name: mosquitto',
      '  z2m:',
      '    image: koenkk/zigbee2mqtt',
      '  matter:',
      '    image: ghcr.io/home-assistant-libs/python-matter-server:6',
    ].join('\n');

    const cleanCompose = [
      '# ha-bridge talks to an upstream Home Assistant over its API but never',
      '# runs mosquitto / zigbee2mqtt / matter as pops services (ADR-039 Inv 4).',
      'services:',
      '  ha-bridge-api:',
      '    image: ghcr.io/knoxio/pops-ha-bridge:main',
      '    environment:',
      '      # points at the homelab HA, not a pops-owned one',
      '      HOME_ASSISTANT_URL: http://homelab:8123',
      '  finance-api:',
      '    image: ghcr.io/knoxio/pops-finance:main',
    ].join('\n');

    const leakyLitestream = ['dbs:', '  - path: /data/sqlite/mosquitto.db'].join('\n');
    const cleanLitestream = ['dbs:', '  - path: /data/sqlite/finance.db'].join('\n');

    // Quote-wrapped service keys + digest-pinned images (no tag) are the two
    // evasion shapes plain `key:` / `image: name:tag` matching used to miss.
    const edgeCompose = [
      'services:',
      '  "home-assistant":',
      '    image: "ghcr.io/home-assistant/home-assistant@sha256:deadbeef"',
      "  'mosquitto':",
      '    image: eclipse-mosquitto@sha256:cafe',
    ].join('\n');

    // A `#` inside an image coordinate is content, not a comment. Truncating
    // at the first `#` left `image: registry.internal/team` behind, which
    // matches nothing — the leak below became invisible.
    const hashCompose = [
      'services:',
      '  broker:',
      '    image: registry.internal/team#2/eclipse-mosquitto:2 # the homelab broker',
    ].join('\n');

    // Valid Compose the previous line-walker could not enter. The parser reads
    // it as the ordinary declaration it is, so these must now be flagged as
    // leaks — not as a shape the guard cannot handle.
    const flowCompose = 'services: { home-assistant: { image: homeassistant/home-assistant } }';
    const flowLitestream = 'dbs: [{ path: /data/sqlite/mosquitto.db }]';

    // The one shape that remains unreadable, and the one that is legal YAML
    // but not a Compose services block. Both must report.
    const brokenCompose = 'services:\n  a:\n   - b\n  - c\n';
    const scalarServices = 'services: 3\n';

    const composeLeaks = scanCompose('leaky-compose.yml', leakyCompose);
    const composeClean = scanCompose('clean-compose.yml', cleanCompose);
    const edgeLeaks = scanCompose('edge-compose.yml', edgeCompose);
    const litePathLeak = scanLitestream('finance.yml', leakyLitestream);
    const liteFileLeak = scanLitestream('mosquitto.yml', cleanLitestream);
    const liteClean = scanLitestream('finance.yml', cleanLitestream);

    /**
     * @param {Violation[]} vs
     * @param {string} service
     * @param {Violation['kind']} kind
     */
    const has = (vs, service, kind) => vs.some((v) => v.service === service && v.kind === kind);

    const checks = {
      // Assert the specific (service, kind) pair, not just that a label appears
      // somewhere — so a regression that drops one detection shape is caught.
      'flags HA service key': has(composeLeaks, 'Home Assistant', 'service-key'),
      'flags HA image': has(composeLeaks, 'Home Assistant', 'image'),
      'flags mosquitto image': has(composeLeaks, 'Mosquitto MQTT broker', 'image'),
      'flags mosquitto container_name': has(
        composeLeaks,
        'Mosquitto MQTT broker',
        'container_name'
      ),
      'flags zigbee2mqtt service key (z2m alias)': has(composeLeaks, 'Zigbee2MQTT', 'service-key'),
      'flags zigbee2mqtt image': has(composeLeaks, 'Zigbee2MQTT', 'image'),
      'flags matter service key': has(composeLeaks, 'Matter server', 'service-key'),
      'flags matter-server image': has(composeLeaks, 'Matter server', 'image'),
      // The evasion shapes fixes 1 + 2 close.
      'flags quoted HA service key': has(edgeLeaks, 'Home Assistant', 'service-key'),
      'flags digest-pinned HA image': has(edgeLeaks, 'Home Assistant', 'image'),
      'flags quoted mosquitto service key': has(edgeLeaks, 'Mosquitto MQTT broker', 'service-key'),
      'flags digest-pinned mosquitto image': has(edgeLeaks, 'Mosquitto MQTT broker', 'image'),
      // Degenerate shapes: the subject is present but not in the form the
      // matcher walks. Each of these read as a clean manifest before.
      'flags an image whose registry path carries a mid-token #': has(
        scanCompose('hash-compose.yml', hashCompose),
        'Mosquitto MQTT broker',
        'image'
      ),
      'flags the leak inside a flow-mapping services block': has(
        scanCompose('flow-compose.yml', flowCompose),
        'Home Assistant',
        'service-key'
      ),
      'flags the leak inside a flow-sequence dbs block': has(
        scanLitestream('finance.yml', flowLitestream),
        'Mosquitto MQTT broker',
        'litestream-path'
      ),
      'reports a manifest that does not parse rather than scanning nothing': scanCompose(
        'broken-compose.yml',
        brokenCompose
      ).some((v) => v.kind === 'unreadable-shape'),
      'reports a services key that is not a mapping of service names': scanCompose(
        'scalar-compose.yml',
        scalarServices
      ).some((v) => v.kind === 'unreadable-shape'),
      'reports an image it cannot read rather than counting it as no image': scanCompose(
        'unreadable-image.yml',
        'services:\n  broker:\n    image:\n      - eclipse-mosquitto\n'
      ).some((v) => v.kind === 'unreadable-shape'),
      'reports a litestream path it cannot read': scanLitestream(
        'finance.yml',
        'dbs:\n  - path:\n      from: /data/sqlite/mosquitto.db\n'
      ).some((v) => v.kind === 'unreadable-shape'),
      'does not flag pops-finance image': !composeLeaks.some((v) =>
        v.evidence.includes('pops-finance')
      ),
      'clean compose stays clean': composeClean.length === 0,
      'flags mosquitto litestream db path': litePathLeak.some(
        (v) => v.kind === 'litestream-path' && v.service === 'Mosquitto MQTT broker'
      ),
      'flags mosquitto-named litestream file': liteFileLeak.some(
        (v) => v.kind === 'litestream-file'
      ),
      'clean litestream stays clean': liteClean.length === 0,
    };

    // Round-trip discovery + read through the real filesystem walker too, and
    // prove the walker skips hidden dirs — a leak parked in .cache must NOT be
    // discovered, while a real infra manifest still is.
    const composeDir = join(dir, 'infra');
    mkdirSync(composeDir, { recursive: true });
    writeFileSync(join(composeDir, 'docker-compose.yml'), leakyCompose);
    const hiddenDir = join(dir, '.cache');
    mkdirSync(hiddenDir, { recursive: true });
    writeFileSync(join(hiddenDir, 'docker-compose.yml'), leakyCompose);
    const manifests = discoverManifests(dir);
    const discovered = findViolations(manifests, (p) => readFileSync(p, 'utf8'), dir);
    checks['discovers + scans a compose file on disk'] =
      manifests.some((m) => m.kind === 'compose') && discovered.length > 0;
    checks['skips hidden directories'] = !manifests.some((m) => m.path.includes('/.cache/'));

    const failed = Object.entries(checks).filter(([, ok]) => !ok);
    if (failed.length > 0) {
      console.error('SELF-TEST FAILED:');
      for (const [name, ok] of Object.entries(checks)) {
        console.error(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`);
      }
      return false;
    }
    console.log(`self-test OK — ${Object.keys(checks).length} assertions passed.`);
    return true;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('Usage: node scripts/ci/check-homelab-service-isolation.mjs [--self-test]');
    process.exit(2);
  }
  if (argv.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const manifests = discoverManifests(repoRoot);
  const violations = findViolations(manifests, (p) => readFileSync(p, 'utf8'));

  if (violations.length === 0) {
    console.log(
      `OK — ${manifests.length} infra manifest(s) scanned; no homelab service ` +
        '(home-assistant / mosquitto / zigbee2mqtt / matter) is run as a pops service.'
    );
    process.exit(0);
  }

  const unreadable = violations.filter((v) => v.kind === 'unreadable-shape');
  console.error(
    `FAIL — ${violations.length} finding(s) in pops infra manifests ` +
      `(${violations.length - unreadable.length} homelab service declaration(s) ` +
      `violating ADR-039 Invariant 4, ${unreadable.length} manifest shape(s) this guard cannot read):\n`
  );
  for (const v of violations) {
    console.error(`  ${v.file} → ${v.path}\n      ${v.service} — ${v.evidence}`);
  }
  if (unreadable.length > 0) {
    console.error(
      '\nA manifest the guard cannot read is reported, not skipped: it would otherwise ' +
        'scan nothing and report green. Fix the document so it parses, or — if the shape ' +
        'is legal and the guard cannot rule on it — teach the guard and cover it in ' +
        '--self-test.'
    );
  }
  console.error(
    '\nhome-assistant, mosquitto, zigbee2mqtt, and matter are homelab ' +
      'infrastructure, not pops (ADR-039 Invariant 4). They must never be run, ' +
      'composed, owned, or backed up as pops services — the homelab-infra repo ' +
      'owns them with its own compose, backup, and Litestream. A pops pillar may ' +
      'talk to an upstream Home Assistant over its API, but must not stand one up.'
  );
  process.exit(1);
}

if (import.meta.main) {
  main();
}
