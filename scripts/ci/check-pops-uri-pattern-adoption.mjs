#!/usr/bin/env node
/**
 * `popsUriPattern` adoption guard.
 *
 * `pillars/purchases/src/contract/schemas/scalars.ts` exports a factory,
 * `popsUriPattern(pillar, type)`, whose entire purpose is to stop a narrow
 * `pops://<pillar>/<type>/<id>` regex from being typed out by hand at each
 * call site. Its own docstring names the failure it exists to prevent:
 * "Written out per site, the validator and the builder for the same shape
 * drift apart without anything failing." Nothing enforced that until this
 * guard — `main` bypassed the factory within days of it landing, in the
 * same file that defines it: a parallel branch relocated
 * `FinanceTransactionUriSchema` and hand-typed its regex rather than
 * importing the factory, because the two branches had no way to see each
 * other's changes to the same region of the file.
 *
 * The reason this is worse than a style nit: the factory's pattern has a
 * capture group. `pillars/purchases/src/api/inventory/asset.ts` reads the
 * id back out with `FINANCE_TRANSACTION_URI.exec(uri)?.[1] ?? null` — a
 * hand-written regex without the capture group degrades that read to
 * `null` rather than throwing, so a bypass here is silent at the exact
 * point that matters: an inventory asset filed with no link back to the
 * transaction that paid for it.
 *
 * What counts as a violation:
 *
 *   - A `/^pops:\/\/…\/…\//` regex LITERAL, outside `scalars.ts`, whose
 *     pillar or type segment is a bare identifier (`finance`, `receipt`,
 *     `item`, …) rather than a regex construct. The one exception is the
 *     generic two-segment class `[a-z0-9-]+` that `PopsUriSchema` itself
 *     uses to match ANY pillar and type — that is the shape the factory
 *     narrows FROM, not a bypass of it.
 *   - A `new RegExp('…pops://…')` or `` new RegExp(`…pops://…`) `` call
 *     whose string/template argument hard-codes a pillar or type segment
 *     rather than interpolating one — the same bypass, spelled as a
 *     constructor call instead of a literal.
 *
 * A call to `popsUriPattern(pillar, type)` itself is always fine — that
 * IS the sanctioned path — and is counted as discovered so the guard can
 * prove its scan reached the two real call sites it already knows about
 * (ADR-045: a guard that iterates a discovered set of zero must fail, not
 * report OK).
 *
 * Scope is production source only (`pillars/purchases/src/**`, excluding
 * `__tests__/` and `*.test.ts`). Several tests assert a specific
 * `pops://<pillar>/<type>/…` shape with `.toMatch(/…/)` — that is a test
 * pinning its own fixture data, not a validator/builder pair that can
 * drift apart the way the factory's docstring warns about, and pillar-wide
 * `PopsUriSchema` remains the wire-level check on top of it either way.
 *
 * What this guard cannot see, tracked rather than covered here: a pattern
 * assembled through string CONCATENATION (`'^pops://' + pillar + '/' + …`)
 * rather than a single string/template argument or a regex literal. Closing
 * that generally needs an expression parser, which conflicts with this
 * guard job's install-free constraint; `pops://` string concatenation does
 * not occur anywhere in the pillar today.
 *
 * Usage:
 *   node scripts/ci/check-pops-uri-pattern-adoption.mjs
 *   node scripts/ci/check-pops-uri-pattern-adoption.mjs --self-test
 *
 * Exit 0 = every discovered pops:// URI pattern definition either goes
 * through `popsUriPattern`, or is the generic `[a-z0-9-]+` shape, and the
 * scan reached at least the three definitions this guard already knows
 * about. Exit 1 = a hand-written narrow pattern was found, or the scan
 * found too few definitions to trust (the discovery floor). Exit 2 =
 * usage error.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const PILLAR_ROOT = 'pillars/purchases/src';

/** A segment with no regex metacharacter can only ever match one literal string — a hand-pinned pillar or type. */
const METACHAR = /[\\[\](){}.+*?^$|]/u;

/** `PopsUriSchema`'s own generic two-segment shape. The one narrow-looking regex this guard must not flag. */
const GENERIC_SEGMENT = '[a-z0-9-]+';

/**
 * @typedef {object} Finding
 * @property {string} path       Repo-relative, posix-separated.
 * @property {number} line       1-based.
 * @property {'factory-call' | 'regex-literal' | 'regexp-constructor'} kind
 * @property {string} pillar
 * @property {string} type
 * @property {boolean} ok        True when this definition is sanctioned (factory call, or the generic literal).
 */

/** @param {string} text @param {number} index @returns {number} 1-based line number of `index` in `text`. */
function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text[i] === '\n') line += 1;
  }
  return line;
}

/** @param {string} seg @returns {boolean} */
function isHandPinnedSegment(seg) {
  return seg.length > 0 && !METACHAR.test(seg);
}

/**
 * `popsUriPattern('pillar', 'type')` call sites. Always sanctioned — this
 * IS the factory the guard exists to make mandatory.
 *
 * @param {string} text @param {string} path @returns {Finding[]}
 */
function findFactoryCalls(text, path) {
  const CALL = /popsUriPattern\(\s*(['"])([^'"]+)\1\s*,\s*(['"])([^'"]+)\3\s*\)/gu;
  /** @type {Finding[]} */
  const findings = [];
  for (const m of text.matchAll(CALL)) {
    findings.push({
      path,
      line: lineAt(text, m.index),
      kind: 'factory-call',
      pillar: m[2] ?? '',
      type: m[4] ?? '',
      ok: true,
    });
  }
  return findings;
}

/**
 * `/^pops:\/\/…\/…\/…$/flags` regex LITERALS. The bypass shape that
 * actually landed on main once already, as described in the file header.
 *
 * A regex literal escapes its own delimiter, so the scheme separator
 * appears in source as the four raw characters `\`, `/`, `\`, `/` — that is
 * the anchor this scan looks for, then reads the two path segments that
 * follow up to the next such escaped slash.
 *
 * @param {string} text @param {string} path @returns {Finding[]}
 */
function findRegexLiterals(text, path) {
  const START = '/^pops:\\/\\/';
  /** @type {Finding[]} */
  const findings = [];
  let from = 0;
  for (;;) {
    const idx = text.indexOf(START, from);
    if (idx === -1) break;
    from = idx + START.length;
    const afterScheme = text.slice(idx + START.length, idx + START.length + 400);
    const nextNewline = afterScheme.indexOf('\n');
    const window = nextNewline === -1 ? afterScheme : afterScheme.slice(0, nextNewline);
    const parts = window.split('\\/');
    const pillar = parts[0] ?? '';
    const type = parts[1] ?? '';
    const ok = !isHandPinnedSegment(pillar) && !isHandPinnedSegment(type);
    findings.push({ path, line: lineAt(text, idx), kind: 'regex-literal', pillar, type, ok });
  }
  return findings;
}

/**
 * `new RegExp('…pops://…')` / `` new RegExp(`…pops://…`) `` calls whose
 * string argument hard-codes a segment rather than interpolating one. The
 * factory's own body is exactly this shape with `${pillar}`/`${type}`
 * interpolation, so a template containing `${` is never a violation here.
 *
 * @param {string} text @param {string} path @returns {Finding[]}
 */
function findRegExpConstructorCalls(text, path) {
  const CALL = /new RegExp\(\s*([`'"])((?:(?!\1)[\s\S])*?)\1/gu;
  /** @type {Finding[]} */
  const findings = [];
  for (const m of text.matchAll(CALL)) {
    const body = m[2] ?? '';
    if (!body.includes('pops://')) continue;
    if (body.includes('${')) continue; // Interpolated — the factory's own shape.
    const idx = body.indexOf('pops://');
    const afterScheme = body.slice(idx + 'pops://'.length);
    const parts = afterScheme.split('/');
    const pillar = parts[0] ?? '';
    const type = parts[1] ?? '';
    const ok = !isHandPinnedSegment(pillar) && !isHandPinnedSegment(type);
    findings.push({
      path,
      line: lineAt(text, m.index),
      kind: 'regexp-constructor',
      pillar,
      type,
      ok,
    });
  }
  return findings;
}

/** @param {string} path @returns {boolean} */
function isProductionFile(path) {
  if (!path.endsWith('.ts') && !path.endsWith('.tsx')) return false;
  if (path.includes('__tests__/')) return false;
  if (path.endsWith('.test.ts') || path.endsWith('.test.tsx')) return false;
  return true;
}

/** @param {string} root @returns {string[]} repo-relative posix paths under `root/PILLAR_ROOT`. */
function listProductionFiles(root) {
  const start = join(root, PILLAR_ROOT);
  if (!existsSync(start)) return [];
  /** @type {string[]} */
  const out = [];
  /** @param {string} dir */
  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      const stat = statSync(abs);
      if (stat.isDirectory()) {
        walk(abs);
        continue;
      }
      const rel = relative(root, abs).split('\\').join('/');
      if (isProductionFile(rel)) out.push(rel);
    }
  }
  walk(start);
  return out.toSorted((a, b) => a.localeCompare(b));
}

/**
 * @typedef {object} ScanReport
 * @property {Finding[]} findings
 * @property {string[]} violations
 */

/**
 * @param {string} root
 * @returns {ScanReport}
 */
export function scan(root) {
  /** @type {Finding[]} */
  const findings = [];
  for (const path of listProductionFiles(root)) {
    const text = readFileSync(join(root, path), 'utf8');
    findings.push(
      ...findFactoryCalls(text, path),
      ...findRegexLiterals(text, path),
      ...findRegExpConstructorCalls(text, path)
    );
  }

  /** @type {string[]} */
  const violations = [];

  for (const f of findings) {
    if (f.ok) continue;
    violations.push(
      `${f.path}:${f.line} — hand-written ${f.kind === 'regexp-constructor' ? 'new RegExp(…)' : 'regex literal'} ` +
        `pins pops://${f.pillar}/${f.type}/… by hand instead of calling popsUriPattern('${f.pillar}', '${f.type}'). ` +
        'See pillars/purchases/src/contract/schemas/scalars.ts.'
    );
  }

  const DISCOVERY_FLOOR = 3;
  if (findings.length < DISCOVERY_FLOOR) {
    violations.push(
      `discovery floor not met: found ${String(findings.length)} pops:// URI pattern definition(s) under ` +
        `${PILLAR_ROOT}, expected at least ${String(DISCOVERY_FLOOR)} (the two known popsUriPattern call sites ` +
        "plus PopsUriSchema's generic literal). Either the scan is broken, or a known definition was removed " +
        'without this guard being told.'
    );
  } else {
    const hasFinanceTransactionCall = findings.some(
      (f) => f.kind === 'factory-call' && f.pillar === 'finance' && f.type === 'transaction'
    );
    const hasInventoryItemCall = findings.some(
      (f) => f.kind === 'factory-call' && f.pillar === 'inventory' && f.type === 'item'
    );
    const hasGenericLiteral = findings.some(
      (f) =>
        f.kind === 'regex-literal' && f.pillar === GENERIC_SEGMENT && f.type === GENERIC_SEGMENT
    );
    if (!hasFinanceTransactionCall) {
      violations.push(
        "discovery floor not met: no popsUriPattern('finance', 'transaction') call site found. " +
          'The scan may no longer be reading scalars.ts.'
      );
    }
    if (!hasInventoryItemCall) {
      violations.push(
        "discovery floor not met: no popsUriPattern('inventory', 'item') call site found. " +
          'The scan may no longer be reading contract/inventory-proposals.ts.'
      );
    }
    if (!hasGenericLiteral) {
      violations.push(
        "discovery floor not met: PopsUriSchema's generic /^pops:\\/\\/[a-z0-9-]+\\/[a-z0-9-]+\\/…/ " +
          'literal was not found. The scan may no longer be reading scalars.ts.'
      );
    }
  }

  return { findings, violations };
}

/** @param {Record<string, string>} files @returns {string} a temp dir under `PILLAR_ROOT` populated with `files`. */
function fixtureTree(files) {
  const root = mkdtempSync(join(tmpdir(), 'pops-uri-pattern-adoption-'));
  for (const [name, contents] of Object.entries(files)) {
    const abs = join(root, PILLAR_ROOT, name);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, contents);
  }
  return root;
}

/** The three known-good definitions, so a clean fixture meets the discovery floor the same way the real tree does. */
const CLEAN_SCALARS = [
  'export const PopsUriSchema = z.string().regex(/^pops:\\/\\/[a-z0-9-]+\\/[a-z0-9-]+\\/[^/\\s]+$/u);',
  '',
  'export function popsUriPattern(pillar, type) {',
  "  return new RegExp(`^pops://${pillar}/${type}/([^/\\\\s]+)$`, 'u');",
  '}',
  '',
  "export const FINANCE_TRANSACTION_URI = popsUriPattern('finance', 'transaction');",
].join('\n');

const CLEAN_INVENTORY_PROPOSALS = [
  "import { popsUriPattern } from './schemas/scalars.js';",
  '',
  "export const INVENTORY_ITEM_URI = popsUriPattern('inventory', 'item');",
].join('\n');

function selfTest() {
  /** @type {Record<string, boolean>} */
  const checks = {};
  /** @type {string[]} */
  const roots = [];

  /**
   * @param {string} name
   * @param {Record<string, string>} files
   * @param {(report: ScanReport) => boolean} assertion
   */
  function run(name, files, assertion) {
    const root = fixtureTree(files);
    roots.push(root);
    checks[name] = assertion(scan(root));
  }

  run(
    'a clean tree (factory calls + generic literal, nothing hand-pinned) has no violations',
    {
      'contract/schemas/scalars.ts': CLEAN_SCALARS,
      'contract/inventory-proposals.ts': CLEAN_INVENTORY_PROPOSALS,
    },
    (report) => report.violations.length === 0
  );

  run(
    'a hand-written regex literal pinning both segments is reported',
    {
      'contract/schemas/scalars.ts': CLEAN_SCALARS,
      'contract/inventory-proposals.ts': CLEAN_INVENTORY_PROPOSALS,
      'contract/rest-reconcile-batch.ts':
        'export const FinanceTransactionUriSchema = z.string().regex(/^pops:\\/\\/finance\\/transaction\\/[^/\\s]+$/u);',
    },
    (report) =>
      report.violations.some(
        (v) =>
          v.includes('rest-reconcile-batch.ts') &&
          v.includes('finance') &&
          v.includes('transaction')
      )
  );

  run(
    'a hand-written regex literal pinning only the pillar segment is reported',
    {
      'contract/schemas/scalars.ts': CLEAN_SCALARS,
      'contract/inventory-proposals.ts': CLEAN_INVENTORY_PROPOSALS,
      'contract/half-pinned.ts':
        'export const HALF = /^pops:\\/\\/documents\\/[a-z0-9-]+\\/[^/\\s]+$/u;',
    },
    (report) =>
      report.violations.some((v) => v.includes('half-pinned.ts') && v.includes('documents'))
  );

  run(
    "a hand-written new RegExp('…') with a hard-coded segment is reported",
    {
      'contract/schemas/scalars.ts': CLEAN_SCALARS,
      'contract/inventory-proposals.ts': CLEAN_INVENTORY_PROPOSALS,
      'api/inventory/bypass.ts':
        "export const RECEIPT_URI = new RegExp('^pops://purchases/receipt/([^/\\\\s]+)$', 'u');",
    },
    (report) =>
      report.violations.some(
        (v) => v.includes('bypass.ts') && v.includes('purchases') && v.includes('receipt')
      )
  );

  run(
    'a fully generic hand-written regex (not the pinned [a-z0-9-]+ shape) is not flagged',
    {
      'contract/schemas/scalars.ts': CLEAN_SCALARS,
      'contract/inventory-proposals.ts': CLEAN_INVENTORY_PROPOSALS,
      'api/cron/soft-uri.ts': 'const match = /^pops:\\/\\/([^/]+)\\/([^/]+)\\/(.+)$/.exec(uri);',
    },
    (report) => report.violations.length === 0
  );

  run(
    'a tree missing the known factory call sites fails the discovery floor rather than passing empty',
    {
      'contract/other.ts': 'export const NOTHING_TO_SEE = 1;',
    },
    (report) => report.violations.some((v) => v.includes('discovery floor'))
  );

  checks['the real repo tree has no violations'] = scan(repoRoot).violations.length === 0;

  const ok = Object.values(checks).every(Boolean);
  if (!ok) {
    console.error('SELF-TEST FAILED:');
    for (const [name, pass] of Object.entries(checks)) console.error(`  ${name}: ${pass}`);
  } else {
    console.log(
      'self-test OK — factory calls and the generic literal pass, a hand-pinned regex literal, a ' +
        'half-pinned literal, and a hand-pinned new RegExp(…) are all reported, a fully generic hand-written ' +
        'regex is not a false positive, an empty tree fails the discovery floor, and the real tree is clean.'
    );
  }
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  return ok;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/ci/check-pops-uri-pattern-adoption.mjs\n' +
        '       node scripts/ci/check-pops-uri-pattern-adoption.mjs --self-test\n\n' +
        'Fails when a pillars/purchases production file defines a narrow pops:// URI pattern by ' +
        'hand instead of calling popsUriPattern(pillar, type).'
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const { findings, violations } = scan(repoRoot);

  console.log(
    `Scanned ${String(findings.length)} pops:// URI pattern definition(s) under ${PILLAR_ROOT}.`
  );

  if (violations.length > 0) {
    console.error(`FAIL — ${violations.length} popsUriPattern adoption problem(s):`);
    for (const violation of violations) console.error(`  ${violation}`);
    process.exit(1);
  }

  console.log('OK — every pops:// URI pattern in pillars/purchases goes through popsUriPattern.');
  process.exit(0);
}

if (import.meta.main) {
  main();
}
