#!/usr/bin/env node
/**
 * Shared-runtime completeness guard (POPS-3322).
 *
 * `scripts/build-remote.ts` already asserts that no package **on**
 * `SHARED_RUNTIME_SPECIFIERS` is inlined into a loader-mounted pillar's
 * bundle. Nothing asserted the list holds every package that belongs on it,
 * so that guard was exactly as good as a hand-maintained array — and it
 * printed `OK — no shared-runtime package inside the bundle` over a bundle
 * carrying a second copy of `sonner` for seven pillars and several weeks
 * (POPS-3320).
 *
 * The property that actually matters — "a second copy of this package splits
 * state something on the other side of the loader boundary is reading" — is
 * not decidable from a `package.json`. Most duplication is deliberate and
 * cheap: `lucide-react` and `@pops/types` are duplicated on purpose, because
 * externalising them would grow the import map the shell has to emit without
 * buying anything.
 *
 * So this is an allowlist inversion rather than a detector, the same shape
 * POPS-3260 gave the form-control gate. The **candidate** set is computable
 * from disk: every package that is a direct dependency of BOTH the host (the
 * shell, or `libs/ui`, which the shell bundles) AND at least one
 * `pillars/<id>/app`. Each candidate must be either on
 * `SHARED_RUNTIME_SPECIFIERS` or on {@link DUPLICATED_DELIBERATELY} below,
 * carrying a reason specific to that package. A new shared dependency then
 * fails this gate until someone decides which it is.
 *
 * `sonner` would have been caught the day it was added: `pillars/shell`
 * depends on it, `libs/ui` imports `Toaster` from it, and seven pillar apps
 * depend on it directly.
 *
 * It also closes the second half of the same omission. A specifier can reach
 * `SHARED_RUNTIME_SPECIFIERS` without reaching `SHARED_RUNTIME_ENTRY_POINTS`,
 * which is a worse failure than the one it fixes: the pillar's bundle stops
 * containing the package and the host's import map never learns to hand it
 * over, so the browser refuses a bare specifier and the pillar does not mount
 * at all. Every specifier must therefore carry an entry-point row.
 *
 * Tier A (ADR-045): reads `package.json` files and one TS source file as
 * text, imports nothing beyond `node:*`, runs with no `node_modules`.
 *
 * Usage:
 *   node scripts/ci/check-shared-runtime-completeness.mjs
 *   node scripts/ci/check-shared-runtime-completeness.mjs --self-test
 *
 * Exit 0 = clean. Exit 1 = at least one finding. Exit 2 = usage error.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/** Repo-relative path of the file holding both shared-runtime lists. */
export const REMOTE_BUILD_SOURCE = join('libs', 'sdk', 'src', 'remote-build', 'index.ts');

/**
 * Manifests that make a package a candidate from the HOST side.
 *
 * `libs/ui` is here and the other `libs/*` are not, because the shell bundles
 * `@pops/ui` into its own graph — a dependency of the kit is a dependency of
 * the host at runtime, which is exactly how `sonner` became shared without
 * appearing in the shell's own manifest.
 */
export const HOST_MANIFESTS = [
  join('pillars', 'shell', 'package.json'),
  join('libs', 'ui', 'package.json'),
];

/**
 * @typedef {object} Exemption
 * @property {string} package  The npm/workspace package name.
 * @property {string} ticket   The issue that decided it.
 * @property {string} reason   Why a second copy splits nothing. Specific to
 *   this package — "harmless" is not a reason, and the self-test rejects it.
 */

/**
 * Packages the host and a pillar app both depend on, where a second copy is
 * deliberate.
 *
 * The bar for a row is the inverse of the bar for `SHARED_RUNTIME_SPECIFIERS`:
 * a reason has to name the state and say why it does not cross the loader
 * boundary. "It is small", "it is stateless", "it is harmless" are not
 * reasons — every one of those was true of `sonner` by inspection too.
 *
 * @type {readonly Exemption[]}
 */
export const DUPLICATED_DELIBERATELY = [
  {
    package: '@hey-api/client-fetch',
    ticket: 'POPS-3322',
    reason:
      'Every consumer vendors its own generated `client/` directory and calls createClient() ' +
      'with its own createClientConfig, so the client instance a bundle dials through is ' +
      'created inside that bundle and never crosses the boundary. The package supplies a ' +
      'factory and types, not an instance anything else reads.',
  },
  {
    package: '@pops/navigation',
    ticket: 'POPS-3322',
    reason:
      'An icon map and route helpers, read as plain values at render time. Nothing registers ' +
      'into it at module scope, so the copy a pillar reads and the copy the shell reads hold ' +
      'identical data.',
  },
  {
    package: '@pops/overlay-ego',
    ticket: 'POPS-3322',
    reason:
      'Components and one hook. The conversation state the shell overlay and cerebrum ChatPage ' +
      'share lives in @tanstack/react-query, which IS shared, so the two copies converge on one ' +
      'cache rather than holding separate ones.',
  },
  {
    package: '@pops/pillar-sdk',
    ticket: 'POPS-3322',
    reason:
      'Pure functions, contracts and types. It holds no module-level registry a pillar writes ' +
      'and the host reads.',
  },
  {
    package: '@pops/types',
    ticket: 'POPS-3322',
    reason: 'Types only — erased at build, so there is no runtime copy to duplicate.',
  },
  {
    package: '@tanstack/react-table',
    ticket: 'POPS-3322',
    reason:
      'Headless. All state lives in the instance useReactTable() returns to the component that ' +
      'called it; there is no module-global table registry, and no table is handed across the ' +
      'boundary.',
  },
  {
    package: 'lucide-react',
    ticket: 'POPS-3322',
    reason:
      'Pure SVG components taking props. Externalising it would put ~1,500 icon modules in the ' +
      "shell's import map to save a tree-shaken handful per pillar.",
  },
  {
    package: 'zustand',
    ticket: 'POPS-3322',
    reason:
      "A store belongs to the module that calls create(). The shell's theme and ui stores are " +
      "read only by shell chrome, and finance's importStore only by finance; no store is " +
      'exported across the boundary, so a second zustand splits nothing that is shared.',
  },
];

/**
 * The number of candidates below which discovery is assumed broken rather
 * than clean (ADR-045).
 *
 * Every pillar app depends on react, react-dom, react-router,
 * @tanstack/react-query, react-i18next, @pops/ui, @pops/types and
 * @pops/pillar-sdk, and the host depends on all eight. So the real tree
 * cannot produce fewer than eight candidates while the loader exists at all,
 * and a run that reports fewer has stopped reading manifests — the shape in
 * which a `for (const x of discover())` guard reports OK over a tree it can
 * no longer see.
 */
export const CANDIDATE_FLOOR = 8;

/**
 * Parse a `package.json`'s direct runtime dependencies.
 *
 * `devDependencies` are excluded on purpose: a build-time tool is not in
 * either bundle's module graph, so it cannot be a second runtime copy.
 *
 * @param {string} path  Absolute path to the manifest.
 * @returns {string[]} Dependency names.
 */
export function readDependencies(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  const deps = typeof parsed === 'object' && parsed !== null ? parsed.dependencies : undefined;
  if (deps === undefined) return [];
  if (typeof deps !== 'object' || deps === null || Array.isArray(deps)) {
    throw new Error(`${path}: "dependencies" is not an object.`);
  }
  return Object.keys(deps);
}

/**
 * @typedef {object} Candidate
 * @property {string} package   Package name.
 * @property {string[]} pillars Pillar ids whose app depends on it, sorted.
 */

/**
 * Every package a host manifest and at least one `pillars/<id>/app` both
 * declare as a direct dependency.
 *
 * Throws rather than returning `[]` when the tree does not look like this
 * repo. A missing host manifest or an empty set of pillar apps is the
 * discovery loss ADR-045 is about, and it must not be reported as "no
 * candidates, therefore clean".
 *
 * @param {string} root  Repo root.
 * @returns {Candidate[]} Sorted by package name.
 */
export function discoverCandidates(root) {
  const hostDeps = new Set();
  for (const relative of HOST_MANIFESTS) {
    const path = join(root, relative);
    if (!existsSync(path)) {
      throw new Error(
        `check-shared-runtime-completeness: host manifest ${relative} not found under ${root}. ` +
          'The guard cannot compute the candidate set without it.'
      );
    }
    for (const dep of readDependencies(path)) hostDeps.add(dep);
  }

  const pillarsRoot = join(root, 'pillars');
  if (!existsSync(pillarsRoot)) {
    throw new Error(`check-shared-runtime-completeness: no pillars/ directory under ${root}.`);
  }

  /** @type {Map<string, string[]>} */
  const byPackage = new Map();
  let appsRead = 0;
  for (const entry of readdirSync(pillarsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifest = join(pillarsRoot, entry.name, 'app', 'package.json');
    if (!existsSync(manifest)) continue;
    appsRead += 1;
    for (const dep of readDependencies(manifest)) {
      if (!hostDeps.has(dep)) continue;
      const pillars = byPackage.get(dep);
      if (pillars === undefined) byPackage.set(dep, [entry.name]);
      else pillars.push(entry.name);
    }
  }

  if (appsRead === 0) {
    throw new Error(
      `check-shared-runtime-completeness: read 0 pillars/<id>/app/package.json under ${root}. ` +
        'Every candidate comes from one, so an empty read is a broken scan, not a clean tree.'
    );
  }

  return [...byPackage.entries()]
    .map(([name, pillars]) => ({
      package: name,
      pillars: pillars.toSorted((a, b) => a.localeCompare(b)),
    }))
    .toSorted((a, b) => a.package.localeCompare(b.package));
}

/**
 * Extract a `readonly string[]` list's string literals out of the
 * remote-build source text.
 *
 * Read as text rather than imported so this stays a plain-`node` script with
 * no TS toolchain, matching the other Tier A guards. A rename or a reshape of
 * the declaration throws instead of yielding an empty list — an empty list
 * would make every candidate look already-classified from the wrong side.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function extractSharedRuntimeSpecifiers(source) {
  const match =
    /export const SHARED_RUNTIME_SPECIFIERS: readonly string\[\] = \[([\s\S]*?)\];/u.exec(source);
  if (!match) {
    throw new Error(
      'check-shared-runtime-completeness: could not find `export const SHARED_RUNTIME_SPECIFIERS' +
        `: readonly string[] = [...];` +
        ` in ${REMOTE_BUILD_SOURCE} — has it been renamed or reshaped?`
    );
  }
  return [...(match[1] ?? '').matchAll(/'([^']+)'/gu)]
    .map((m) => m[1])
    .filter((s) => s !== undefined);
}

/**
 * Extract the `specifier` of every `SHARED_RUNTIME_ENTRY_POINTS` row.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function extractSharedRuntimeEntryPoints(source) {
  const match = /export const SHARED_RUNTIME_ENTRY_POINTS[\s\S]*?\}\[\] = \[([\s\S]*?)\n\];/u.exec(
    source
  );
  if (!match) {
    throw new Error(
      'check-shared-runtime-completeness: could not find `export const ' +
        `SHARED_RUNTIME_ENTRY_POINTS ... = [...];` +
        ` in ${REMOTE_BUILD_SOURCE} — has it been renamed or reshaped?`
    );
  }
  return [...(match[1] ?? '').matchAll(/specifier:\s*'([^']+)'/gu)]
    .map((m) => m[1])
    .filter((s) => s !== undefined);
}

/**
 * @typedef {object} Findings
 * @property {Candidate[]} unclassified  Candidates on neither list.
 * @property {string[]} staleExemptions  Exempted packages that are no longer
 *   candidates — the allowlist outliving the shape it described.
 * @property {string[]} contradictory    Packages on BOTH the shared list and
 *   the exemption list, which cannot both be true.
 * @property {string[]} missingEntryPoint  Shared specifiers with no
 *   entry-point row, so the host cannot hand them over.
 */

/**
 * The pure classification. Exported so the unit suite can drive shapes the
 * filesystem fixtures do not reach.
 *
 * @param {Candidate[]} candidates
 * @param {string[]} sharedSpecifiers
 * @param {string[]} entryPointSpecifiers
 * @param {readonly Exemption[]} exemptions
 * @returns {Findings}
 */
export function classify(candidates, sharedSpecifiers, entryPointSpecifiers, exemptions) {
  const shared = new Set(sharedSpecifiers);
  const exempt = new Set(exemptions.map((e) => e.package));
  const candidateNames = new Set(candidates.map((c) => c.package));
  const entryPoints = new Set(entryPointSpecifiers);

  return {
    unclassified: candidates.filter((c) => !shared.has(c.package) && !exempt.has(c.package)),
    staleExemptions: [...exempt].filter((p) => !candidateNames.has(p)).toSorted(),
    contradictory: [...exempt].filter((p) => shared.has(p)).toSorted(),
    missingEntryPoint: sharedSpecifiers.filter((s) => !entryPoints.has(s)).toSorted(),
  };
}

/** @param {Findings} findings */
function hasFindings(findings) {
  return (
    findings.unclassified.length > 0 ||
    findings.staleExemptions.length > 0 ||
    findings.contradictory.length > 0 ||
    findings.missingEntryPoint.length > 0
  );
}

/**
 * @param {Findings} findings
 * @param {(line: string) => void} write
 */
function report(findings, write) {
  for (const candidate of findings.unclassified) {
    write(
      `✗ ${candidate.package} — a direct dependency of the host AND of ` +
        `${candidate.pillars.join(', ')}, and on neither list.`
    );
  }
  if (findings.unclassified.length > 0) {
    write('');
    write('  Decide which it is, in the same PR that made it shared:');
    write(
      `  • A second copy would split state something across the loader boundary reads → add it`
    );
    write(
      `    to SHARED_RUNTIME_SPECIFIERS *and* SHARED_RUNTIME_ENTRY_POINTS in ${REMOTE_BUILD_SOURCE}.`
    );
    write(
      '  • A second copy splits nothing → add a DUPLICATED_DELIBERATELY row in this guard, with'
    );
    write('    a reason naming the state and why it does not cross the boundary.');
  }
  for (const name of findings.staleExemptions) {
    write(
      `✗ ${name} — DUPLICATED_DELIBERATELY row for a package that is no longer shared by the ` +
        'host and a pillar app. Delete the row.'
    );
  }
  for (const name of findings.contradictory) {
    write(
      `✗ ${name} — on SHARED_RUNTIME_SPECIFIERS *and* DUPLICATED_DELIBERATELY. It is externalised, ` +
        'so it is not duplicated; delete the exemption row.'
    );
  }
  for (const name of findings.missingEntryPoint) {
    write(
      `✗ ${name} — on SHARED_RUNTIME_SPECIFIERS with no SHARED_RUNTIME_ENTRY_POINTS row. The ` +
        "pillar's bundle will externalise it and the host's import map will not resolve it, so " +
        'the pillar fails to mount.'
    );
  }
}

function runCheck() {
  const candidates = discoverCandidates(repoRoot);
  if (candidates.length < CANDIDATE_FLOOR) {
    console.error(
      `✗ shared-runtime completeness: found only ${candidates.length} candidate(s), below the ` +
        `floor of ${CANDIDATE_FLOOR}. Discovery is broken, not the tree clean.`
    );
    process.exit(1);
  }

  const source = readFileSync(join(repoRoot, REMOTE_BUILD_SOURCE), 'utf8');
  const findings = classify(
    candidates,
    extractSharedRuntimeSpecifiers(source),
    extractSharedRuntimeEntryPoints(source),
    DUPLICATED_DELIBERATELY
  );

  console.log(
    `Scanned ${candidates.length} package(s) shared between the host and at least one pillar app.`
  );
  if (!hasFindings(findings)) {
    console.log(
      'OK — every shared package is externalised or exempted, and every specifier is servable.'
    );
    process.exit(0);
  }
  report(findings, (line) => {
    console.error(line);
  });
  process.exit(1);
}

/**
 * Write a minimal package manifest.
 *
 * @param {string} path
 * @param {string} name
 * @param {string[]} deps
 */
function writeManifest(path, name, deps) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({ name, dependencies: Object.fromEntries(deps.map((d) => [d, '*'])) })
  );
}

/**
 * Build a synthetic repo root on disk.
 *
 * The self-test drives {@link discoverCandidates} over a real directory tree
 * rather than handing {@link classify} a pre-made candidate list, because the
 * omission this guard exists to catch lives in discovery, not in the diff: a
 * scan that stops seeing `pillars/<id>/app` manifests returns an empty
 * candidate set, and every candidate is then trivially classified. A
 * self-test that skipped the filesystem would pass over exactly that.
 *
 * @param {string} root
 * @param {{ host: string[], uiKit?: string[], apps: Record<string, string[]> }} tree
 */
function materialise(root, tree) {
  writeManifest(join(root, 'pillars', 'shell', 'package.json'), '@pops/shell', tree.host);
  writeManifest(join(root, 'libs', 'ui', 'package.json'), '@pops/ui', tree.uiKit ?? []);
  for (const [pillar, deps] of Object.entries(tree.apps)) {
    writeManifest(
      join(root, 'pillars', pillar, 'app', 'package.json'),
      `@pops/${pillar}-app`,
      deps
    );
  }
}

/** @returns {never} */
function runSelfTest() {
  const root = mkdtempSync(join(tmpdir(), 'shared-runtime-guard-'));
  /** @type {Record<string, boolean>} */
  const checks = {};
  try {
    const exempt = [{ package: 'lucide-react', ticket: 'T-1', reason: 'stateless icons' }];

    materialise(root, {
      host: ['react', 'lucide-react'],
      apps: { finance: ['react', 'lucide-react'] },
    });
    const clean = classify(discoverCandidates(root), ['react'], ['react'], exempt);
    checks['a classified tree produces no findings'] = !hasFindings(clean);

    materialise(root, {
      host: ['react', 'lucide-react', 'sonner'],
      apps: { finance: ['react', 'lucide-react', 'sonner'] },
    });
    const omitted = classify(discoverCandidates(root), ['react'], ['react'], exempt);
    checks['an unclassified shared package is flagged'] =
      omitted.unclassified.length === 1 && omitted.unclassified[0]?.package === 'sonner';

    materialise(root, {
      host: ['react', 'lucide-react', 'vite'],
      apps: { finance: ['react', 'lucide-react'] },
    });
    const hostOnly = classify(discoverCandidates(root), ['react'], ['react'], exempt);
    checks['a host-only dependency is not a candidate'] = !hasFindings(hostOnly);

    materialise(root, {
      host: ['react'],
      apps: { finance: ['react', 'zustand'] },
    });
    const pillarOnly = classify(discoverCandidates(root), ['react'], ['react'], exempt);
    checks['a pillar-only dependency is not a candidate'] =
      pillarOnly.unclassified.length === 0 && pillarOnly.staleExemptions.length === 1;

    // libs/ui is a host manifest in its own right: `sonner` reached the host
    // graph through the kit, never through the shell's own dependencies.
    materialise(root, {
      host: ['react'],
      uiKit: ['sonner'],
      apps: { finance: ['react', 'sonner'] },
    });
    const viaKit = classify(discoverCandidates(root), ['react'], ['react'], []);
    checks['a dependency shared only via libs/ui is a candidate'] =
      viaKit.unclassified.length === 1 && viaKit.unclassified[0]?.package === 'sonner';

    materialise(root, { host: ['react'], apps: { finance: ['react'] } });
    const both = classify(
      discoverCandidates(root),
      ['react'],
      ['react'],
      [{ package: 'react', ticket: 'T-1', reason: 'x' }]
    );
    checks['a package on both lists is flagged as contradictory'] =
      both.contradictory.length === 1 && both.contradictory[0] === 'react';

    const noEntry = classify(discoverCandidates(root), ['react', 'sonner'], ['react'], []);
    checks['a specifier with no entry-point row is flagged'] =
      noEntry.missingEntryPoint.length === 1 && noEntry.missingEntryPoint[0] === 'sonner';

    // Discovery loss must throw, not report clean. A tree with a host and no
    // pillar apps classifies every (zero) candidate perfectly.
    rmSync(join(root, 'pillars', 'finance'), { recursive: true, force: true });
    let threwOnNoApps = false;
    try {
      discoverCandidates(root);
    } catch {
      threwOnNoApps = true;
    }
    checks['zero pillar apps throws rather than reporting clean'] = threwOnNoApps;

    rmSync(join(root, 'pillars', 'shell'), { recursive: true, force: true });
    let threwOnNoHost = false;
    try {
      discoverCandidates(root);
    } catch {
      threwOnNoHost = true;
    }
    checks['a missing host manifest throws'] = threwOnNoHost;

    const source = readFileSync(join(repoRoot, REMOTE_BUILD_SOURCE), 'utf8');
    checks['the real SHARED_RUNTIME_SPECIFIERS declaration is still parseable'] =
      extractSharedRuntimeSpecifiers(source).includes('react');
    checks['the real SHARED_RUNTIME_ENTRY_POINTS declaration is still parseable'] =
      extractSharedRuntimeEntryPoints(source).includes('react/jsx-runtime');
    let threwOnRenamedList = false;
    try {
      extractSharedRuntimeSpecifiers('export const SOMETHING_ELSE = [];');
    } catch {
      threwOnRenamedList = true;
    }
    checks['a renamed specifier list throws rather than yielding an empty list'] =
      threwOnRenamedList;

    checks['every exemption carries a ticket and a reason of substance'] =
      DUPLICATED_DELIBERATELY.length > 0 &&
      DUPLICATED_DELIBERATELY.every((e) => /^POPS-\d+$/u.test(e.ticket) && e.reason.length >= 60);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  const failed = Object.entries(checks).filter(([, passed]) => !passed);
  if (failed.length === 0) {
    console.log(
      `self-test OK — ${Object.keys(checks).length} checks over a real on-disk fixture tree.`
    );
    process.exit(0);
  }
  console.error('✗ self-test FAILED:');
  for (const [label, passed] of Object.entries(checks)) {
    console.error(`  ${passed ? 'OK' : 'XX'}  ${label}`);
  }
  process.exit(1);
}

function main() {
  const argv = process.argv.slice(2);
  const mode = argv[0];
  if (mode === '--self-test') runSelfTest();
  if (mode !== undefined) {
    console.error('usage: check-shared-runtime-completeness.mjs [--self-test]');
    process.exit(2);
  }
  runCheck();
}

if (import.meta.main) {
  main();
}
