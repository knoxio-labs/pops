#!/usr/bin/env node
/**
 * Producer-side signal: who has to follow this contract change.
 *
 * A pillar that publishes `pillars/<id>/openapi/<id>.openapi.json` may have
 * consumers that keep a VENDORED copy of that snapshot inside their own unit
 * boundary (ADR-033, and `./check-vendored-contracts.mjs` for why the copy
 * exists at all). A change to the producer's contract obliges every one of
 * those consumers to re-vendor and regenerate. This reports, on the change that
 * creates that obligation, which consumers it lands on — by name.
 *
 * WHAT THIS IS NOT. It is not a second drift gate. `check-vendored-contracts.mjs`
 * already hard-fails a producer's own branch when a consumer's copy on that
 * branch was left behind, and that half needs nothing from this script. What
 * that gate cannot do is speak when the producer got it RIGHT: a PR that
 * changes a contract and re-vendors every in-tree copy is green, and the author
 * is never told that the same contract is vendored on branches this tree cannot
 * see. Those branches are the ones that get evicted from the merge queue later,
 * on work that has nothing to do with the contract.
 *
 * WHY IT CANNOT BLOCK, and does not try to. The obligation it reports may be
 * owed to a pull request that is not merged yet. Failing the producer until the
 * consumer lands would deadlock the pair — the consumer is usually waiting on
 * the producer. So this exits 0 whenever it can do its job, and the report is
 * the product. It exits non-zero only when it cannot do its job: no vendored
 * consumer discovered at all (a floor — see `main`), or a changed-file list it
 * was pointed at and could not read.
 *
 * THE HOLE IT DOES NOT CLOSE, stated rather than implied. A vendored leg being
 * ADDED on another branch is invisible here, because on the producer's branch
 * that consumer does not exist yet — no tree-local check can see a copy that is
 * not in the tree. That is the exact shape of the eviction this script was
 * written after, and closing it needs the list of open pull requests, not the
 * filesystem. The amendment to ADR-033 records that trade as taken knowingly.
 *
 * Usage:
 *   node scripts/ci/report-contract-consumers.mjs --changed-from <file>
 *   node scripts/ci/report-contract-consumers.mjs
 *   node scripts/ci/report-contract-consumers.mjs --self-test
 *
 * `--changed-from` takes a newline-delimited list of repo-relative paths (what
 * `git diff --name-only` prints). WITHOUT it the script cannot scope itself to
 * one change, and reports EVERY vendored leg under a header that says so —
 * loudly wrong rather than quietly silent, because "no scope" and "nothing
 * changed" must never print the same way.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  VENDOR_DIRECTORIES,
  deriveExpectedContracts,
  discoverVendoredContracts,
  readOrNull,
} from './check-vendored-contracts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/**
 * A changed path that obliges a producer pillar's consumers. Anything under a
 * pillar's `openapi/` directory counts, not just the snapshot itself: the
 * snapshot is generated, and a change to what generates it arrives here in the
 * same commit.
 */
const PRODUCER_CONTRACT_PATH = /^pillars\/([^/]+)\/openapi\//u;

/**
 * @typedef {object} ConsumerRow
 * @property {string} pillarId     Producer pillar id.
 * @property {string} copy         Absolute path of the vendored copy.
 * @property {string} source       Absolute path of the canonical producer spec.
 * @property {string | null} declaredBy Absolute path of the consumer's codegen
 *   config, or `null` when the copy was found by the directory scan and no
 *   config declares it.
 */

/**
 * Every vendored copy in the tree, indexed by the producer pillar it mirrors.
 *
 * Built from BOTH halves of the drift guard's discovery, unioned: the directory
 * scan finds copies on disk, the declaration reader finds copies a consumer's
 * own codegen config says it depends on. Either half alone under-reports — a
 * copy whose directory moved is missing from the scan, a copy nothing declares
 * is missing from the declarations — and this script's whole job is to name
 * consumers, so it takes the union and records which half saw each one.
 *
 * @param {string} root Repo root to scan.
 * @returns {Map<string, ConsumerRow[]>} Keyed by producer pillar id; rows sorted
 *   by copy path, keys iterable in sorted order.
 */
export function buildConsumerIndex(root) {
  /** @type {Map<string, ConsumerRow>} */
  const byCopy = new Map();

  for (const found of discoverVendoredContracts(root)) {
    byCopy.set(found.copy, {
      pillarId: found.pillarId,
      copy: found.copy,
      source: found.source,
      declaredBy: null,
    });
  }
  // Second, so a declared copy always carries its declaration — the scan half
  // cannot know it, and a row that lost it would print "nothing declares this"
  // about a copy something does.
  for (const declared of deriveExpectedContracts(root)) {
    byCopy.set(declared.copy, {
      pillarId: declared.pillarId,
      copy: declared.copy,
      source: declared.source,
      declaredBy: declared.declaredBy,
    });
  }

  /** @type {Map<string, ConsumerRow[]>} */
  const index = new Map();
  for (const row of [...byCopy.values()].toSorted((a, b) => a.copy.localeCompare(b.copy))) {
    const rows = index.get(row.pillarId);
    if (rows === undefined) index.set(row.pillarId, [row]);
    else rows.push(row);
  }
  return new Map([...index.entries()].toSorted(([a], [b]) => a.localeCompare(b)));
}

/**
 * The producer pillars whose published contract this change set touches.
 *
 * @param {readonly string[]} changedPaths Repo-relative, posix-separated.
 * @returns {string[]} Unique pillar ids, sorted.
 */
export function producersInChangeSet(changedPaths) {
  /** @type {Set<string>} */
  const ids = new Set();
  for (const path of changedPaths) {
    const match = PRODUCER_CONTRACT_PATH.exec(path.trim());
    if (match?.[1] !== undefined) ids.add(match[1]);
  }
  return [...ids].toSorted((a, b) => a.localeCompare(b));
}

/**
 * A mise task header, in either spelling TOML allows for a dotted key:
 * `[tasks."generate:bfm-client"]` and `[tasks.generate]`.
 */
const MISE_TASK_HEADER = /^\s*\[tasks\.(?:"([^"]+)"|([\w:.-]+))\]/u;

/** Any other table header — enough to know the task above no longer applies. */
const ANY_TABLE_HEADER = /^\s*\[/u;

/**
 * The mise task that re-vendors a given copy, or `null` when the file does not
 * say so in a shape this can read.
 *
 * Hand-rolled rather than parsed, because this script runs in an install-free
 * Tier A job and has no TOML parser (ADR-045's tier amendment). The narrowness
 * is deliberate and bounded: it looks for the task header nearest above the
 * assignment that names this copy, gives up at any other table header, and
 * returns `null` — which the caller prints as "see the declaring file" — for
 * everything else. Nothing downstream depends on it succeeding; it upgrades a
 * correct-but-vague line into an exact one.
 *
 * @param {string} text     The declaring file's contents.
 * @param {string} filename The vendored copy's basename.
 * @returns {string | null}
 */
export function miseTaskFor(text, filename) {
  /** @type {string | null} */
  let task = null;
  for (const line of text.split('\n')) {
    const header = MISE_TASK_HEADER.exec(line);
    if (header !== null) {
      task = header[1] ?? header[2] ?? null;
      continue;
    }
    if (ANY_TABLE_HEADER.test(line)) {
      task = null;
      continue;
    }
    if (task !== null && line.includes(filename) && /vendored\s*=/u.test(line)) return task;
  }
  return null;
}

/**
 * @typedef {{ kind: 'command', commands: string[], pkgName: string }
 *   | { kind: 'task', command: string, dir: string }
 *   | { kind: 'undeclared' }
 *   | { kind: 'no-manifest', dir: string }
 *   | { kind: 'unparsable-manifest', dir: string, detail: string }
 *   | { kind: 'no-script', dir: string, pkgName: string }} RegenerateHint
 */

/**
 * How the consumer regenerates its client from the copy, derived rather than
 * listed — a hardcoded command per leg is a fourth place to forget.
 *
 * The declaring config's OWN directory owns the regeneration, so that is where
 * this looks: a `package.json` beside the config and the `scripts` entry whose
 * body names that config file, or — for a consumer that is in neither workspace
 * and declares its copy in a mise task instead (`clients/ios`, ADR-043) — the
 * task that assignment sits in. Every outcome other than a derived command is
 * REPORTED as itself rather than collapsed into silence: the reader then
 * follows the declaring file, which is always printed.
 *
 * @param {{ declaredBy: string | null, copy: string }} row
 * @param {(p: string) => string | null} read
 * @returns {RegenerateHint}
 */
export function deriveRegenerateHint({ declaredBy, copy }, read) {
  if (declaredBy === null) return { kind: 'undeclared' };
  const dir = dirname(declaredBy);
  const manifestText = read(join(dir, 'package.json'));
  if (manifestText === null) {
    if (basename(declaredBy) === 'mise.toml') {
      const text = read(declaredBy);
      const task = text === null ? null : miseTaskFor(text, basename(copy));
      if (task !== null) return { kind: 'task', command: `mise run ${task}`, dir };
    }
    return { kind: 'no-manifest', dir };
  }

  /** @type {{ name?: unknown, scripts?: Record<string, unknown> }} */
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch (error) {
    return { kind: 'unparsable-manifest', dir, detail: String(error) };
  }
  const pkgName = typeof manifest.name === 'string' ? manifest.name : dir;
  const needle = basename(declaredBy);
  const commands = Object.entries(manifest.scripts ?? {})
    .filter(([, body]) => typeof body === 'string' && body.includes(needle))
    .map(([script]) => `pnpm --filter ${pkgName} ${script}`);

  return commands.length === 0
    ? { kind: 'no-script', dir, pkgName }
    : { kind: 'command', commands, pkgName };
}

/**
 * Read a changed-file list.
 *
 * A list that cannot be read is an error, not an empty change set: an empty
 * change set prints as "no producer contract changed", which is a claim about
 * the repo this script would have no basis to make.
 *
 * @param {string} path
 * @param {(p: string) => string | null} read
 * @returns {{ paths: string[], error: null } | { paths: null, error: string }}
 */
export function readChangedPaths(path, read) {
  let text;
  try {
    text = read(path);
  } catch (error) {
    return { paths: null, error: `could not read ${path}: ${String(error)}` };
  }
  if (text === null) return { paths: null, error: `no such changed-file list: ${path}` };
  return {
    paths: text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
    error: null,
  };
}

/** @param {string} to @param {string} [root] */
function rel(to, root = repoRoot) {
  return to.startsWith(`${root}/`) ? to.slice(root.length + 1) : to;
}

/**
 * The report itself.
 *
 * Returns lines, not console output, so both the self-test and the Vitest suite
 * can assert on what a producer author actually sees — including that a
 * producer with no consumers produces NOTHING, which is the half a guard
 * usually gets wrong.
 *
 * @param {object} args
 * @param {Map<string, ConsumerRow[]>} args.index
 * @param {string[] | null} args.producers Producers this change set touched, or
 *   `null` when the change set is unknown (report every leg).
 * @param {(p: string) => string | null} args.read
 * @param {string} [args.root]
 * @returns {string[]}
 */
export function formatReport({ index, producers, read, root = repoRoot }) {
  const subjects = producers === null ? [...index.keys()] : producers.filter((id) => index.has(id));
  if (subjects.length === 0) return [];

  /** @type {string[]} */
  const lines = [];
  if (producers === null) {
    lines.push(
      'NO CHANGE SET — could not scope this run to one change, so every vendored leg in the',
      'tree is listed below. This is not a claim that all of them changed.',
      ''
    );
  }

  for (const pillarId of subjects) {
    const rows = index.get(pillarId) ?? [];
    const plural = rows.length === 1 ? 'consumer' : 'consumers';
    lines.push(
      `pillars/${pillarId}/openapi/ — ${rows.length} vendored ${plural} must follow this contract:`
    );
    for (const row of rows) {
      lines.push(`  ${rel(row.copy, root)}`);
      lines.push(
        row.declaredBy === null
          ? '      declared by  (nothing — found by directory scan only)'
          : `      declared by  ${rel(row.declaredBy, root)}`
      );
      lines.push(`      re-vendor    cp ${rel(row.source, root)} ${rel(row.copy, root)}`);
      const hint = deriveRegenerateHint(row, read);
      for (const line of regenerateLines(hint, root)) lines.push(line);
    }
    lines.push('');
  }

  lines.push(
    'Re-vendoring is not one copy. The copy, the consumer’s generated client and the',
    'consuming unit’s own typecheck are separate gates, and a contract change that lands',
    'without all three leaves the next branch to touch that unit red.',
    '',
    'This run saw only the copies in THIS tree. A branch that vendors the same contract',
    'without having merged yet is invisible here, and is the branch a merge-queue eviction',
    'lands on — see the 2026-08-15 amendment to',
    'docs/architecture/adr-033-cross-language-pillar-contracts.md.'
  );
  return lines;
}

/**
 * @param {RegenerateHint} hint
 * @param {string} root
 * @returns {string[]}
 */
function regenerateLines(hint, root) {
  if (hint.kind === 'command') return hint.commands.map((c) => `      regenerate   ${c}`);
  if (hint.kind === 'task') {
    return [`      regenerate   ${hint.command}   (from ${rel(hint.dir, root)})`];
  }
  if (hint.kind === 'undeclared') {
    return ['      regenerate   unknown — no codegen config in this tree declares this copy'];
  }
  if (hint.kind === 'no-manifest') {
    return [
      `      regenerate   see the declaring file — ${rel(hint.dir, root)} is not a pnpm package`,
    ];
  }
  if (hint.kind === 'unparsable-manifest') {
    return [
      `      regenerate   unknown — ${rel(hint.dir, root)}/package.json did not parse: ${hint.detail}`,
    ];
  }
  return [`      regenerate   unknown — no script in ${hint.pkgName} names the declaring config`];
}

/**
 * Self-test half one: the signal fires for a producer that HAS consumers, and
 * is silent for one that does not.
 *
 * Built from `VENDOR_DIRECTORIES` rather than from a fixed pair of paths, so a
 * new vendored location is covered the moment it is added to the drift guard.
 * Each synthetic consumer gets a real declaration file of the shape its unit
 * kind uses, so the declaration half of the union is exercised too.
 *
 * @returns {boolean}
 */
function selfTestFiresAndStaysSilent() {
  const root = mkdtempSync(join(tmpdir(), 'contract-consumers-fires-'));
  try {
    /** @type {string[]} */
    const copies = [];
    for (const [index, [unitKind, ...withinUnit]] of VENDOR_DIRECTORIES.entries()) {
      const pillarId = `producer${index}`;
      mkdirSync(join(root, 'pillars', pillarId, 'openapi'), { recursive: true });
      writeFileSync(join(root, 'pillars', pillarId, 'openapi', `${pillarId}.openapi.json`), '{}\n');

      const consumerDir = join(root, unitKind, `consumer${index}`);
      const contractsDir = join(consumerDir, ...withinUnit);
      mkdirSync(contractsDir, { recursive: true });
      const copy = join(contractsDir, `${pillarId}.openapi.json`);
      writeFileSync(copy, '{}\n');
      copies.push(copy);

      if (index === 0) {
        const appDir = join(consumerDir, 'app');
        mkdirSync(appDir, { recursive: true });
        writeFileSync(
          join(appDir, `openapi-ts.${pillarId}.config.ts`),
          `export default { input: fileURLToPath(new URL('./contracts/${pillarId}.openapi.json', import.meta.url)) };\n`
        );
        writeFileSync(
          join(appDir, 'package.json'),
          `${JSON.stringify(
            {
              name: `@pops/app-consumer${index}`,
              scripts: {
                'generate:api': 'openapi-ts',
                [`generate:${pillarId}-client`]: `openapi-ts -f openapi-ts.${pillarId}.config.ts`,
              },
            },
            null,
            2
          )}\n`
        );
      } else {
        writeFileSync(
          join(consumerDir, 'mise.toml'),
          `[tasks."generate:${pillarId}-client"]\nrun = '''\nvendored=Contracts/${pillarId}.openapi.json\n'''\n`
        );
      }
    }

    // A producer nothing vendors — the silent case must be silent BECAUSE it
    // has no consumers, not because discovery came back empty, so it is built
    // in the same tree as the producers that do.
    mkdirSync(join(root, 'pillars', 'lonely', 'openapi'), { recursive: true });
    writeFileSync(join(root, 'pillars', 'lonely', 'openapi', 'lonely.openapi.json'), '{}\n');

    const index = buildConsumerIndex(root);
    const read = (/** @type {string} */ p) => readOrNull(p);

    const fired = formatReport({
      index,
      producers: producersInChangeSet(['pillars/producer0/openapi/producer0.openapi.json']),
      read,
      root,
    });
    const namesTheConsumer = fired.some((l) => l.includes(rel(copies[0] ?? '', root)));
    const namesTheCommand = fired.some((l) =>
      l.includes('pnpm --filter @pops/app-consumer0 generate:producer0-client')
    );
    const namesOnlyThatOne = !fired.some((l) => l.includes(rel(copies[1] ?? '', root)));

    const silent = formatReport({
      index,
      producers: producersInChangeSet([
        'pillars/lonely/openapi/lonely.openapi.json',
        'pillars/lonely/src/index.ts',
      ]),
      read,
      root,
    });

    // A source change under a producer that HAS consumers is not a contract
    // change and must not fire either — the matcher is anchored on the
    // `openapi/` directory, and a matcher anchored on the pillar would pass
    // this half while shouting on every commit.
    const unrelated = formatReport({
      index,
      producers: producersInChangeSet(['pillars/producer0/src/routes.ts']),
      read,
      root,
    });

    // No scope at all is the third outcome, and it is neither of the first
    // two: every leg, under a header that says the run could not be scoped.
    const unscoped = formatReport({ index, producers: null, read, root });
    const unscopedIsLoud =
      unscoped.some((l) => l.startsWith('NO CHANGE SET')) &&
      VENDOR_DIRECTORIES.every((_, i) =>
        unscoped.some((l) => l.includes(rel(copies[i] ?? '', root)))
      );

    // The non-pnpm consumer's command comes out of its mise task rather than a
    // package manifest, and that leg is the one a BFM contract change lands on.
    const namesTheTask = unscoped.some((l) => l.includes('mise run generate:producer1-client'));

    const ok =
      namesTheConsumer &&
      namesTheCommand &&
      namesOnlyThatOne &&
      namesTheTask &&
      silent.length === 0 &&
      unrelated.length === 0 &&
      unscopedIsLoud;
    if (!ok) {
      console.error('SELF-TEST FAILED (fires / stays silent):');
      console.error(`  named the obliged consumer:                 ${namesTheConsumer}`);
      console.error(`  derived its regenerate command:             ${namesTheCommand}`);
      console.error(`  derived the mise consumer's task:           ${namesTheTask}`);
      console.error(`  named no OTHER producer's consumer:         ${namesOnlyThatOne}`);
      console.error(`  silent for a producer with no consumers:    ${silent.length === 0}`);
      console.error(`  silent for a non-contract change:           ${unrelated.length === 0}`);
      console.error(`  unscoped run reports every leg, loudly:     ${unscopedIsLoud}`);
      return false;
    }
    console.log(
      `self-test OK — fires for a producer with consumers across all ${VENDOR_DIRECTORIES.length} ` +
        'vendored location(s), silent for one without.'
    );
    return true;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * Self-test half two: the degenerate cases, which for a reporter all have the
 * same shape — something it cannot see must never print as something it saw
 * and found fine.
 *
 * Covers a tree with no vendored copy at all (the discovery floor `main`
 * enforces), a changed-file list that is not on disk, and a declaration whose
 * package manifest is missing or unparsable.
 *
 * @returns {boolean}
 */
function selfTestDegenerate() {
  const root = mkdtempSync(join(tmpdir(), 'contract-consumers-degenerate-'));
  try {
    mkdirSync(join(root, 'pillars', 'producer0', 'openapi'), { recursive: true });
    writeFileSync(join(root, 'pillars', 'producer0', 'openapi', 'producer0.openapi.json'), '{}\n');

    const emptyIndex = buildConsumerIndex(root);
    const floorHolds = emptyIndex.size === 0;

    const missingList = readChangedPaths(join(root, 'nope.txt'), readOrNull);
    const missingListReported = missingList.paths === null && missingList.error !== null;

    const unreadableList = readChangedPaths(join(root, 'boom.txt'), () => {
      throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
    });
    const unreadableListReported = unreadableList.paths === null && unreadableList.error !== null;

    const config = join(root, 'somewhere', 'openapi-ts.x.config.ts');
    const copy = join(root, 'somewhere', 'contracts', 'x.openapi.json');
    const noManifest = deriveRegenerateHint({ declaredBy: config, copy }, () => null);
    const unparsable = deriveRegenerateHint({ declaredBy: config, copy }, () => '{ not json');
    const noScript = deriveRegenerateHint(
      { declaredBy: config, copy },
      () => '{"name":"@pops/app-x","scripts":{"build":"tsc"}}'
    );
    const undeclared = deriveRegenerateHint({ declaredBy: null, copy }, () => null);
    const hintsReported =
      noManifest.kind === 'no-manifest' &&
      unparsable.kind === 'unparsable-manifest' &&
      noScript.kind === 'no-script' &&
      undeclared.kind === 'undeclared' &&
      [noManifest, unparsable, noScript, undeclared].every(
        (hint) => regenerateLines(hint, root).length === 1
      );

    // The hand-rolled task matcher must give up rather than guess. An
    // assignment under a table that is not a task belongs to no task, and an
    // assignment naming a DIFFERENT copy is not this row's — both fall back to
    // the declaring file, which is the outcome that is merely vague instead of
    // wrong.
    const taskText =
      '[tasks."generate:x-client"]\nrun = """\nvendored=Contracts/x.openapi.json\n"""\n';
    const taskFound = miseTaskFor(taskText, 'x.openapi.json') === 'generate:x-client';
    const wrongCopy = miseTaskFor(taskText, 'other.openapi.json') === null;
    const notATask =
      miseTaskFor('[env]\nvendored=Contracts/x.openapi.json\n', 'x.openapi.json') === null;
    const noHeaderAtAll =
      miseTaskFor('vendored=Contracts/x.openapi.json\n', 'x.openapi.json') === null;
    const taskMatcherHonest = taskFound && wrongCopy && notATask && noHeaderAtAll;

    const ok =
      floorHolds &&
      missingListReported &&
      unreadableListReported &&
      hintsReported &&
      taskMatcherHonest;
    if (!ok) {
      console.error('SELF-TEST FAILED (degenerate):');
      console.error(`  a tree with no vendored copy discovers none:   ${floorHolds}`);
      console.error(`  an absent changed-file list is an error:       ${missingListReported}`);
      console.error(`  an unreadable changed-file list is an error:   ${unreadableListReported}`);
      console.error(`  every undecidable regenerate hint still says so: ${hintsReported}`);
      console.error(`  the task matcher gives up instead of guessing:  ${taskMatcherHonest}`);
      return false;
    }
    console.log(
      'self-test OK — an empty tree, an unreadable change set and an underivable command ' +
        'each report as themselves.'
    );
    return true;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** @param {string[]} lines */
function emit(lines) {
  for (const line of lines) console.log(line);
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath === undefined || summaryPath === '' || lines.length === 0) return;
  try {
    writeFileSync(
      summaryPath,
      `\n### Vendored consumers of a changed contract\n\n\`\`\`\n${lines.join('\n')}\n\`\`\`\n`,
      { flag: 'a' }
    );
  } catch (error) {
    // The report already went to the log; losing the prettier copy is not
    // worth failing a producer's build over, but it is worth saying out loud.
    console.error(`(could not append to GITHUB_STEP_SUMMARY: ${String(error)})`);
  }
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(
      'Usage: node scripts/ci/report-contract-consumers.mjs [--changed-from <file>] [--self-test]'
    );
    process.exit(2);
  }
  if (argv.includes('--self-test')) {
    const fires = selfTestFiresAndStaysSilent();
    const degenerate = selfTestDegenerate();
    process.exit(fires && degenerate ? 0 : 1);
  }

  const flagIndex = argv.indexOf('--changed-from');
  if (flagIndex !== -1 && argv[flagIndex + 1] === undefined) {
    console.error('FAIL — --changed-from needs a file path');
    process.exit(1);
  }

  /** @type {Map<string, ConsumerRow[]>} */
  let index;
  try {
    index = buildConsumerIndex(repoRoot);
  } catch (error) {
    console.error(`FAIL — could not scan the tree for vendored contracts: ${String(error)}`);
    process.exit(1);
  }

  // The floor. This script's output is a filtered view of `index`, so an index
  // that came back empty prints exactly what a repo with no obligations prints
  // — silence — while meaning something else entirely. The drift guard next
  // door carries the same floor for the same reason; see the comment there for
  // what to do if the count ever legitimately reaches zero.
  if (index.size === 0) {
    console.error(
      'FAIL — discovered zero vendored pillar contracts, but this repo is known to vendor at ' +
        'least one (see scripts/ci/check-vendored-contracts.mjs). Either every vendored copy ' +
        'was deliberately removed — update this floor in the same commit — or a consuming ' +
        'unit’s contracts directory moved and the scan can no longer see it.'
    );
    process.exit(1);
  }

  /** @type {string[] | null} */
  let producers = null;
  if (flagIndex !== -1) {
    const listPath = argv[flagIndex + 1] ?? '';
    const { paths, error } = readChangedPaths(listPath, readOrNull);
    if (paths === null) {
      console.error(`FAIL — ${error}`);
      process.exit(1);
    }
    producers = producersInChangeSet(paths);
  }

  const lines = formatReport({ index, producers, read: readOrNull });
  if (lines.length === 0) {
    console.log(
      `OK — this change touches no pillar contract that anything in this tree vendors ` +
        `(${index.size} producer(s) are vendored here: ${[...index.keys()].join(', ')}).`
    );
    process.exit(0);
  }
  emit(lines);
  process.exit(0);
}

if (import.meta.main) {
  main();
}
