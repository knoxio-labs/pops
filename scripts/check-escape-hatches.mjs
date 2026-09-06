#!/usr/bin/env node
/**
 * Escape-hatch ratchet gate (type-safety monotonicity).
 *
 * Type-safety escape hatches — `as any`, `as unknown as`, `as never`, and
 * `eslint-disable` directives — silence the compiler/linter instead of fixing
 * the underlying issue. They are how a real defect hides in plain sight: a
 * `progress as never` once laundered a gutted DTO past the type-checker and
 * crashed the finance import wizard at runtime. The repo's operating rules
 * forbid them outright; reality is we still carry a grandfathered set from the
 * tRPC→REST migration.
 *
 * Two of the kinds are NOT single-line, because the same defeat is routinely
 * spelled across two. `Record<string, unknown>` is comparable to essentially
 * every object type, so a value staged in one and asserted out of it buys
 * exactly what `as unknown as` buys, with neither line containing a hatch:
 *
 *     const out: Record<string, unknown> = {};      // no `as` here
 *     for (const k of KEYS) out[k] = input[k];
 *     return out as Partial<Insert>;                // target is a normal type
 *
 * That pair sat in the inventory item write path for a release while the gate
 * reported "5 hatches, baseline 5, unchanged" (POPS-3019). The load-bearing
 * word is *staged*: the bag is BUILT here — declared wide, then populated by
 * property or index write — and only then asserted onto a type nothing proved
 * it has. A `Record<string, unknown>` that merely RECEIVES a value (a JSON
 * boundary, a parsed body, a dynamic parameter) is not this and is not
 * counted; see `WIDE_TYPE` and `isStagedContainer` for exactly where the line
 * sits, and `--self-test` for the negative fixtures that pin it.
 *
 * This gate makes that set a one-way ratchet, exactly like the dep-cruiser
 * known-violations baseline (EX-3): the count of hatches per (file, kind) may
 * only ever stay flat or SHRINK. A PR that adds a new hatch — or grows the
 * count in a file already carrying some — fails. Fix the type instead, or, if
 * the hatch is genuinely irreducible (a third-party generic, a ref forward),
 * regenerate the baseline with `--write` and justify it in review.
 *
 * Scope: hand-written production source under `pillars/` and `libs/`. Generated
 * API clients (`*.gen.ts`, `*-api/{core,client,sdk}/`) and test/story files are
 * excluded — generated code is not ours to fix and tests legitimately mock with
 * casts (the lint config already relaxes `no-explicit-any` there).
 *
 * `@ts-ignore` / `@ts-nocheck` are intentionally NOT ratcheted here — the
 * oxlint `ban-ts-comment` rule blocks them natively (allowing only described
 * `@ts-expect-error`), which is a cleaner hard-zero than a baseline.
 *
 * Usage:
 *   node scripts/check-escape-hatches.mjs            # check working tree vs baseline
 *   node scripts/check-escape-hatches.mjs --write    # regenerate the baseline
 *   node scripts/check-escape-hatches.mjs --self-test # prove the gate catches a new hatch
 *
 * Exit 0 = no new hatches. Exit 1 = at least one new/grown hatch. Exit 2 = usage error.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const BASELINE_PATH = join(repoRoot, '.escape-hatch-baseline.json');
const ROOTS = ['pillars', 'libs'];
const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const IGNORE_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
  'storybook-static',
  'playwright-report',
  'test-results',
]);

/** Generated code we do not own — never ratcheted. */
const GENERATED_RE =
  /\.gen\.ts$|\.generated\.|[/\\][a-z-]*-api[/\\](core|client|sdk)[/\\]|api-types\./;

/** Test / story / fixture files — casts there are mocks, not production risk. */
const TEST_RE =
  /\.test\.|\.spec\.|\.stories\.|[/\\]__tests__[/\\]|[/\\]e2e[/\\]|test-utils|test-setup|\.test-d\./;

/**
 * The hatch kinds we ratchet, each a matcher over a single source line.
 * `as` casts are skipped on pure-comment lines (a docstring mentioning
 * "`as never`" is not a cast); `eslint-disable` lives in comments by nature.
 * @type {Array<{ kind: string, match: (line: string, isComment: boolean) => boolean }>}
 */
const HATCH_KINDS = [
  { kind: 'as any', match: (l, isComment) => !isComment && /\bas any\b/.test(l) },
  { kind: 'as unknown as', match: (l, isComment) => !isComment && /\bas unknown as\b/.test(l) },
  { kind: 'as never', match: (l, isComment) => !isComment && /\bas never\b/.test(l) },
  { kind: 'eslint-disable', match: (l) => /eslint-disable/.test(l) },
];

/**
 * @param {string} absDir
 * @param {(absFile: string) => void} onFile
 */
function walk(absDir, onFile) {
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const abs = join(absDir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      walk(abs, onFile);
    } else if (entry.isFile() && SOURCE_EXT.has(entry.name.slice(entry.name.lastIndexOf('.')))) {
      onFile(abs);
    }
  }
}

/** @param {string} relPath */
function isScannable(relPath) {
  return !GENERATED_RE.test(relPath) && !TEST_RE.test(relPath);
}

/**
 * A type so wide that asserting it onto anything else is unchecked: TS compares
 * for *comparability*, not assignability, and every object type is comparable
 * to these. Staging a value in one is how you spend an `as unknown as` without
 * writing one.
 */
const WIDE_TYPE = String.raw`(?:any|unknown|object|Record\s*<\s*(?:string|PropertyKey)\s*,\s*(?:unknown|any)\s*>)`;

/**
 * Assertion targets that are NOT a narrowing back to a specific type, and so
 * do not close the laundering loop. `const` is a genuine narrowing; the other
 * four are already counted by their own single-line kinds, and counting them
 * again here would double-charge one cast.
 */
const NON_NARROWING_TARGET = String.raw`(?:const|any|unknown|never)\b|Record\s*<\s*(?:string|PropertyKey)\s*,\s*(?:unknown|any)\s*>|object\b`;

/** `const|let|var NAME: <wide>` whose initializer opens a literal container. */
const WIDE_LITERAL_DECL_RE = new RegExp(
  String.raw`\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*:\s*${WIDE_TYPE}\s*=\s*[[{]`,
  'g'
);

/** `const|let|var NAME: <wide>` with any (or no) initializer. */
const WIDE_DECL_RE = new RegExp(
  String.raw`\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*:\s*${WIDE_TYPE}\s*[=;]`,
  'g'
);

/**
 * `(target as Record<string, unknown>)[key] = value` — the inline sibling. It
 * widens a typed object at the point of writing into it, so the key and the
 * value are both checked against the bag rather than against the column. Same
 * defeat, one line, and `update-builder.ts` carried it (POPS-3019).
 */
const WRITE_THROUGH_RE = new RegExp(
  String.raw`\(\s*[A-Za-z_$][\w$]*\s+as\s+${WIDE_TYPE}\s*\)\s*(?:\[[^\]\n]*\]|\.[\w$]+)\s*(?:\+\+|--|[-+*/%|&^]?=(?!=))`,
  'g'
);

/**
 * Escape a captured identifier for literal use in a RegExp (`$` is a metachar).
 * @param {string} name
 */
function escapeForRegExp(name) {
  return name.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * Blank out lines the file itself presents as comments, keeping the line count
 * so reported positions stay honest. Same heuristic the single-line kinds use,
 * so a docstring showing the pattern is not read as code in either.
 * @param {string} text
 */
function stripCommentLines(text) {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      return trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')
        ? ''
        : line;
    })
    .join('\n');
}

/**
 * Is `name` a container this file BUILDS, rather than one it receives?
 *
 * This is the whole false-positive story. A wide binding that is only ever read
 * — `const parsed: unknown = JSON.parse(body)`, a dynamic payload, a validator's
 * input — is legitimate and stays uncounted no matter what is asserted from it.
 * A wide binding that is populated by property or index write, or seeded with a
 * literal, is a staging bag; asserting it onto a real type is the hatch.
 *
 * @param {string} code comment-stripped source
 * @param {string} name
 */
function isStagedContainer(code, name) {
  const id = escapeForRegExp(name);
  const seededWithLiteral = new RegExp(
    String.raw`\b(?:const|let|var)\s+${id}\s*:\s*${WIDE_TYPE}\s*=\s*[[{]`
  );
  const writtenThrough = new RegExp(
    String.raw`(?<![\w$])${id}\s*(?:\[[^\]\n]*\]|\.[\w$]+)\s*(?:\+\+|--|[-+*/%|&^]?=(?!=))`
  );
  return seededWithLiteral.test(code) || writtenThrough.test(code);
}

/**
 * Count the multi-line laundering kinds in a whole file.
 *
 * Deliberate limits, so the header is not read as a promise the matcher cannot
 * keep: only `const`/`let`/`var` bindings are treated as staging (a wide
 * *parameter* asserted in its own body is the same defeat and is NOT counted),
 * and binding identity is per-file rather than per-scope, so two same-named
 * locals in one file are one subject.
 *
 * @param {string} text
 * @returns {{ 'wide staging cast': number, 'wide write-through cast': number }}
 */
function countLaunderedCasts(text) {
  const code = stripCommentLines(text);

  const declared = new Set();
  for (const m of code.matchAll(WIDE_LITERAL_DECL_RE)) declared.add(m[1]);
  for (const m of code.matchAll(WIDE_DECL_RE)) declared.add(m[1]);

  let staging = 0;
  for (const name of declared) {
    if (!isStagedContainer(code, name)) continue;
    const assertedOut = new RegExp(
      String.raw`(?<![\w$])${escapeForRegExp(name)}\s+as\s+(?!${NON_NARROWING_TARGET})`,
      'g'
    );
    staging += [...code.matchAll(assertedOut)].length;
  }

  return {
    'wide staging cast': staging,
    'wide write-through cast': [...code.matchAll(WRITE_THROUGH_RE)].length,
  };
}

/**
 * Count escape hatches per kind in a single file's text.
 * @param {string} text
 * @returns {Record<string, number>}
 */
export function countHatchesInText(text) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const rawLine of text.split('\n')) {
    const trimmed = rawLine.trim();
    const isComment =
      trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*');
    for (const { kind, match } of HATCH_KINDS) {
      if (match(rawLine, isComment)) counts[kind] = (counts[kind] ?? 0) + 1;
    }
  }
  for (const [kind, n] of Object.entries(countLaunderedCasts(text))) {
    if (n > 0) counts[kind] = n;
  }
  return counts;
}

/**
 * Scan the whole repo and return per-file hatch counts, keyed by repo-relative
 * POSIX path. Files with zero hatches are omitted.
 * @returns {Record<string, Record<string, number>>}
 */
export function collectHatches() {
  return sortDeep(scanHatches().hatches);
}

/**
 * The same scan, plus the file count it was derived from.
 *
 * The count is what tells "no hatches left" apart from "nothing was scanned".
 * Without it a renamed `ROOTS` entry yields `{}`, which the ratchet reads as a
 * clean tree — and then invites `--write` to lock the empty result in as the
 * new baseline, destroying it (ADR-045).
 *
 * @returns {{ hatches: Record<string, Record<string, number>>, scanned: number }}
 */
export function scanHatches() {
  /** @type {Record<string, Record<string, number>>} */
  const result = {};
  let scanned = 0;
  for (const root of ROOTS) {
    const absRoot = join(repoRoot, root);
    if (!existsSync(absRoot)) {
      throw new Error(
        `escape-hatch gate: ${root}/ does not exist. A unit-kind root was renamed under the ` +
          'ratchet; update ROOTS in scripts/check-escape-hatches.mjs to wherever it now lives.'
      );
    }
    walk(absRoot, (abs) => {
      const rel = relative(repoRoot, abs).split('\\').join('/');
      if (!isScannable(rel)) return;
      scanned += 1;
      const counts = countHatchesInText(readFileSync(abs, 'utf8'));
      if (Object.keys(counts).length > 0) result[rel] = counts;
    });
  }
  return { hatches: result, scanned };
}

/**
 * Stable, diff-friendly ordering for the committed baseline.
 * @param {Record<string, Record<string, number>>} obj
 * @returns {Record<string, Record<string, number>>}
 */
function sortDeep(obj) {
  /** @type {Record<string, Record<string, number>>} */
  const out = {};
  for (const file of Object.keys(obj).toSorted()) {
    const fileKinds = obj[file] ?? {};
    /** @type {Record<string, number>} */
    const kinds = {};
    for (const kind of Object.keys(fileKinds).toSorted()) kinds[kind] = fileKinds[kind] ?? 0;
    out[file] = kinds;
  }
  return out;
}

/** @returns {Record<string, Record<string, number>>} */
function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) {
    console.error(
      `✗ escape-hatch gate: baseline ${relative(repoRoot, BASELINE_PATH)} missing. ` +
        `Run \`pnpm check:escape-hatches:baseline\` to create it.`
    );
    process.exit(2);
  }
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch (e) {
    console.error(
      `✗ escape-hatch gate: baseline is not valid JSON (${e instanceof Error ? e.message : String(e)})`
    );
    process.exit(2);
  }
}

/**
 * Compare current counts against a baseline. Returns the list of growths
 * (new files, new kinds, or higher counts). An empty list means clean.
 * @param {Record<string, Record<string, number>>} current
 * @param {Record<string, Record<string, number>>} baseline
 * @returns {Array<{ file: string, kind: string, was: number, now: number }>}
 */
export function diffAgainstBaseline(current, baseline) {
  const growths = [];
  for (const [file, kinds] of Object.entries(current)) {
    for (const [kind, now] of Object.entries(kinds)) {
      const was = baseline[file]?.[kind] ?? 0;
      if (now > was) growths.push({ file, kind, was, now });
    }
  }
  return growths;
}

function runCheck() {
  const { hatches, scanned } = scanHatches();
  const current = sortDeep(hatches);
  const baseline = loadBaseline();
  const growths = diffAgainstBaseline(current, baseline);
  const currentTotal = total(current);
  const baselineTotal = total(baseline);

  // A ratchet that reads no files has stopped looking, not been satisfied, and
  // the `--write` invited below would erase it. Reaching zero hatches over a
  // tree the scanner CAN read is the goal, so only the empty scan fails here.
  if (scanned === 0) {
    console.error(
      `✗ escape-hatch gate: the scanner read 0 files against a baseline of ${baselineTotal} ` +
        'hatch(es). Check ROOTS, IGNORE_DIRS and isScannable — do NOT rebaseline, `--write` ' +
        'here would erase the ratchet.'
    );
    process.exit(1);
  }

  if (growths.length > 0) {
    console.error(`✗ escape-hatch gate: ${growths.length} new type-safety escape hatch(es):\n`);
    for (const g of growths) {
      console.error(`    ${g.file} — "${g.kind}" ${g.was} → ${g.now}`);
    }
    console.error(
      `\n  These silence the compiler/linter instead of fixing the type. Fix the underlying\n` +
        `  issue. If the hatch is genuinely irreducible (third-party generic, ref forward),\n` +
        `  run \`pnpm check:escape-hatches:baseline\` and justify it in review.`
    );
    process.exit(1);
  }

  const delta = baselineTotal - currentTotal;
  const trend =
    delta > 0
      ? ` (shrank by ${delta} — run \`pnpm check:escape-hatches:baseline\` to lock in the win)`
      : ' (unchanged)';
  console.log(`✔ escape-hatch gate: ${currentTotal} hatch(es), baseline ${baselineTotal}${trend}.`);
}

/** @param {Record<string, Record<string, number>>} counts */
function total(counts) {
  let n = 0;
  for (const kinds of Object.values(counts)) for (const c of Object.values(kinds)) n += c;
  return n;
}

function runWrite() {
  const current = collectHatches();
  writeFileSync(BASELINE_PATH, `${JSON.stringify(current, null, 2)}\n`);
  console.log(
    `✔ wrote ${relative(repoRoot, BASELINE_PATH)}: ${total(current)} hatch(es) across ${Object.keys(current).length} file(s).`
  );
}

/**
 * Prove the gate catches a newly-introduced hatch, and that it can still see
 * the tree.
 *
 * The diff cases run against a synthetic baseline rather than the real one, so
 * a repo that has genuinely paid off every hatch does not turn them into no-ops
 * — that is the state the ratchet exists to reach. What the real tree is asked
 * for is only the one thing it alone can answer: that the scanner is still
 * finding files to read.
 */
function runSelfTest() {
  const { scanned } = scanHatches();
  if (scanned === 0) {
    console.error(
      '✗ self-test: the scanner read 0 files. It has stopped seeing the tree — check ROOTS, ' +
        'IGNORE_DIRS and isScannable before trusting any later run.'
    );
    process.exit(1);
  }

  // The scanner can read files; this asserts it still recognises a hatch in
  // one. Together the two replace the old real-tree seed, which conflated
  // "the matchers work" with "the repo still has hatches to match".
  const matched = countHatchesInText('const x = y as any;\n// eslint-disable-next-line\n');
  if (matched['as any'] !== 1 || matched['eslint-disable'] !== 1) {
    console.error(
      `✗ self-test: the hatch matchers no longer recognise a plain cast (${JSON.stringify(matched)}).`
    );
    process.exit(1);
  }

  // The shape POPS-3019 was filed about, verbatim from the pre-fix
  // `create-builder.ts` / `update-builder.ts`. Asserting only that the gate
  // exits zero would pass with these matchers deleted, which is the failure
  // mode ADR-045 exists to stop: pin the reported COUNT, both ways.
  /** @type {Array<[label: string, source: string, kind: string, expected: number]>} */
  const launderedPositives = [
    [
      'staged, populated, asserted back',
      'const out: Record<string, unknown> = {};\nfor (const k of KEYS) out[k] = input[k] ?? null;\nreturn out as Partial<Insert>;',
      'wide staging cast',
      1,
    ],
    [
      'staged twice in one file',
      'function a() {\n  const out: Record<string, unknown> = {};\n  out.x = 1;\n  return out as Foo;\n}\nfunction b() {\n  const out: Record<string, unknown> = {};\n  out.y = 2;\n  return out as Bar;\n}',
      'wide staging cast',
      2,
    ],
    [
      'staged via `any` rather than a Record',
      'let acc: any = {};\nacc.total = 1;\nexport default acc as Totals;',
      'wide staging cast',
      1,
    ],
    [
      'write-through widening at the assignment site',
      'const updates: InventoryUpdate = {};\n(updates as Record<string, unknown>)[key] = value ?? null;',
      'wide write-through cast',
      1,
    ],
  ];
  for (const [label, source, kind, expected] of launderedPositives) {
    const got = countHatchesInText(source)[kind] ?? 0;
    if (got !== expected) {
      console.error(
        `✗ self-test: laundered-cast case "${label}" reported ${got} "${kind}", expected ${expected}. ` +
          'A cast can now be spent through a staging variable without the ratchet seeing it (POPS-3019).'
      );
      process.exit(1);
    }
  }

  // A matcher that flags every `Record<string, unknown>` is worse than none:
  // people learn to ignore it and baseline the noise. These are the legitimate
  // uses it must stay silent on — all of them RECEIVE a value rather than
  // build one, which is precisely where `isStagedContainer` draws the line.
  /** @type {Array<[label: string, source: string]>} */
  const launderedNegatives = [
    [
      'a parsed JSON boundary, narrowed once',
      'const parsed: unknown = JSON.parse(body);\nreturn parsed as Config;',
    ],
    [
      'a wide bag that is returned as itself',
      'const meta: Record<string, unknown> = {};\nmeta.trace = id;\nreturn meta;',
    ],
    [
      'a wide bag narrowed with `as const`',
      'const flags: Record<string, unknown> = {};\nflags.on = true;\nreturn flags as const;',
    ],
    [
      'a different identifier carrying the assertion',
      'const bag: Record<string, unknown> = {};\nbag.k = 1;\nreturn other as Config;',
    ],
    [
      'an identifier that merely starts with the staged name',
      'const bag: Record<string, unknown> = {};\nbag.k = 1;\nreturn bagged as Config;',
    ],
    [
      'a dynamic parameter, never staged',
      'function f(input: Record<string, unknown>) {\n  return Object.keys(input);\n}',
    ],
    ['a type alias, not a binding', 'type Json = Record<string, unknown>;\nconst x = y as Json;'],
    [
      'an equality test, not a write',
      'const probe: unknown = read();\nif (probe.kind === "a") return probe as Node;',
    ],
    [
      'a read through a widening cast, rather than a write',
      'const seg = (current as Record<string, unknown>)[key];',
    ],
    [
      'a cast an existing single-line kind already charges for',
      'const out: Record<string, unknown> = {};\nout.k = 1;\nreturn out as unknown as Foo;',
    ],
    [
      'the pattern shown inside a docstring',
      '/**\n * const out: Record<string, unknown> = {};\n * out.k = 1;\n * return out as Foo;\n */\nexport const ok = 1;',
    ],
  ];
  for (const [label, source] of launderedNegatives) {
    const counts = countHatchesInText(source);
    const noise = counts['wide staging cast'] ?? counts['wide write-through cast'];
    if (noise) {
      console.error(
        `✗ self-test: false positive on "${label}" — ${JSON.stringify(counts)}. A guard people ` +
          'learn to ignore is worse than none; tighten the matcher rather than baselining the noise.'
      );
      process.exit(1);
    }
  }

  const existing = 'pillars/demo/src/existing.ts';
  /** @type {Record<string, Record<string, number>>} */
  const baseline = { [existing]: { 'as any': 1, 'as never': 2 } };

  const synthetic = 'pillars/demo/src/new-violation.ts';
  const withNewFile = { ...structuredClone(baseline), [synthetic]: { 'as any': 1 } };
  if (!diffAgainstBaseline(withNewFile, baseline).some((g) => g.file === synthetic)) {
    console.error('✗ self-test: gate failed to flag a synthetic new hatch.');
    process.exit(1);
  }

  const grown = structuredClone(baseline);
  const grownExisting = grown[existing];
  if (!grownExisting) {
    throw new Error(`self-test: clone of the synthetic baseline lost "${existing}"`);
  }
  grownExisting['as any'] = (grownExisting['as any'] ?? 0) + 1;
  if (!diffAgainstBaseline(grown, baseline).some((g) => g.file === existing)) {
    console.error('✗ self-test: gate failed to flag a grown count in an existing file.');
    process.exit(1);
  }

  const newKind = structuredClone(baseline);
  const newKindExisting = newKind[existing];
  if (!newKindExisting) {
    throw new Error(`self-test: clone of the synthetic baseline lost "${existing}"`);
  }
  newKindExisting['as unknown as'] = 1;
  if (!diffAgainstBaseline(newKind, baseline).some((g) => g.kind === 'as unknown as')) {
    console.error('✗ self-test: gate failed to flag a new hatch kind in an existing file.');
    process.exit(1);
  }

  if (diffAgainstBaseline(baseline, baseline).length !== 0) {
    console.error('✗ self-test: gate flagged an unchanged tree.');
    process.exit(1);
  }

  const shrunk = { [existing]: { 'as any': 1 } };
  if (diffAgainstBaseline(shrunk, baseline).length !== 0) {
    console.error('✗ self-test: gate flagged a tree that shrank.');
    process.exit(1);
  }

  console.log(
    `✔ self-test: scanner read ${scanned} file(s); counts ${launderedPositives.length} laundered-cast ` +
      `shapes and stays silent on ${launderedNegatives.length} legitimate wide-type uses; gate flags ` +
      'new files, grown counts and new kinds, and passes an unchanged or shrunk tree.'
  );
}

function main() {
  const mode = process.argv[2];
  if (mode !== '--write' && mode !== '--self-test' && mode !== undefined) {
    console.error(`usage: check-escape-hatches.mjs [--write|--self-test]`);
    process.exit(2);
  }
  try {
    if (mode === '--write') runWrite();
    else if (mode === '--self-test') runSelfTest();
    else runCheck();
  } catch (error) {
    // A tree the scanner cannot read is a gate failure with a readable reason,
    // not a stack trace (ADR-045).
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
