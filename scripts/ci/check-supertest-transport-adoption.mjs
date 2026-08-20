#!/usr/bin/env node
/**
 * Supertest transport adoption guard.
 *
 * `finance`, `bfm`, `purchases`, `media`, `cerebrum`, `documents`, `ai`, `food`
 * and `inventory` each own a pre-listened `127.0.0.1` server plus a pooled
 * keep-alive agent for their API suites, because supertest's own
 * `request(app)` binds a fresh ephemeral server AND dials a fresh connection
 * for every call — two ephemeral ports per request — and that churn is what
 * stalls under machine contention. See AGENTS.md, "Conventions duplicated per
 * pillar", and the diagnosis in
 * `pillars/finance/src/api/__tests__/test-utils.ts`.
 *
 * Each transport's own PROPERTIES are pinned by its own tests. Its ADOPTION
 * was pinned by nothing, and that is the gap this closes. A new test file that
 * writes `import request from 'supertest'` compiles, passes, and reinstates
 * the exact churn the transport exists to remove. The failure is asymmetric
 * and that is why it went unnoticed: a file already converted that regains a
 * `request(app)` call fails typecheck, because the import is gone. A brand-new
 * file that imports supertest itself is invisible to every gate in the repo.
 *
 * So the rule is a whole-pillar ban on the module specifier, not a rule about
 * test directories: exactly one file per pillar — its transport — may name
 * `supertest`, and everything else in the pillar goes through that file. Scoping
 * to `__tests__/` would have left a co-located `foo.test.ts` beside its router
 * (a shape this repo already uses elsewhere) and any helper parked one directory
 * up as legal ways back to the churn.
 *
 * WHAT MAKES THIS GUARD NOT SELF-CONFIRMING (ADR-045). A ban reports nothing
 * when it is healthy, so "no violations" and "the matcher went blind" are the
 * same output. Three things separate them, and each is a violation rather than
 * a skip:
 *
 *   - every pillar's transport is a CANARY. It is the one file allowed to
 *     import supertest, so it must MATCH — if the matcher stops recognising
 *     the transport's own import, the guard says so instead of reporting a
 *     clean tree it can no longer read.
 *   - discovery asserts a floor. A pillar that yields fewer than
 *     its own `minFiles` scannable files means the walk broke, not that the
 *     pillar is small.
 *   - the ban is only meaningful while the package is reachable, so each
 *     pillar must still DECLARE supertest. A pillar that dropped the dependency
 *     is reported rather than silently ban-free.
 *
 * The specifier set is derived from each pillar's `package.json` rather than
 * hardcoded, so a dependency alias (`"http-probe": "npm:supertest"`) is banned
 * under its alias too instead of walking straight past a specifier ban.
 *
 * Reads TS/JS source and JSON, pulls in no third-party dependency at any depth
 * (Tier A, ADR-045).
 *
 * Usage:
 *   node scripts/ci/check-supertest-transport-adoption.mjs
 *   node scripts/ci/check-supertest-transport-adoption.mjs --self-test
 *   node scripts/ci/check-supertest-transport-adoption.mjs --help
 *
 * Exit 0 = every pillar was found, its transport imports supertest, and no
 * other file in it names the package. Exit 1 = a violation, a missing or
 * gutted transport, a broken walk, or a pillar that no longer declares the
 * dependency. Exit 2 = usage error.
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/**
 * @typedef {object} PillarSpec
 * @property {string} id        Pillar directory name under `pillars/`.
 * @property {string} transport The one file allowed to import supertest, repo-relative posix.
 * @property {number} minFiles  Discovery floor for this pillar; see the note below the list.
 */

/** @type {PillarSpec[]} */
export const PILLARS = [
  { id: 'finance', transport: 'pillars/finance/src/api/__tests__/test-utils.ts', minFiles: 320 },
  { id: 'bfm', transport: 'pillars/bfm/src/api/__tests__/test-http.ts', minFiles: 80 },
  { id: 'purchases', transport: 'pillars/purchases/src/api/__tests__/test-http.ts', minFiles: 200 },
  { id: 'media', transport: 'pillars/media/src/api/__tests__/test-http.ts', minFiles: 310 },
  { id: 'cerebrum', transport: 'pillars/cerebrum/src/api/__tests__/test-http.ts', minFiles: 220 },
  { id: 'documents', transport: 'pillars/documents/src/api/__tests__/test-http.ts', minFiles: 12 },
  { id: 'ai', transport: 'pillars/ai/src/api/__tests__/test-http.ts', minFiles: 82 },
  { id: 'food', transport: 'pillars/food/src/api/__tests__/test-http.ts', minFiles: 436 },
  { id: 'inventory', transport: 'pillars/inventory/src/api/__tests__/test-http.ts', minFiles: 156 },
];

/** The package every transport wraps, and the name a violation reaches for. */
export const BANNED_PACKAGE = 'supertest';

/**
 * Each pillar's `minFiles` is roughly half its current scannable count, so a
 * legitimate shrink does not trip it and a walk that silently returned almost
 * nothing does.
 *
 * It is per-pillar rather than one constant because the pillars differ by more
 * than an order of magnitude — 873 files in food against 25 in documents as of
 * writing. A single floor has to clear the smallest, which leaves it far under
 * every other pillar: food's walk could return 3% of its tree and still pass.
 * A floor that only the smallest pillar can fail is not a floor.
 *
 * Raise a pillar's number when its tree grows; that is the point. A drop large
 * enough to trip one is a structural change worth looking at, not a nuisance
 * to be tuned away.
 */

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

/** Build output and vendored trees, which carry the real package. */
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.turbo',
  '.vite',
  'storybook-static',
  'playwright-report',
  'test-results',
]);

/**
 * Every module specifier in a source text, whatever syntax introduced it:
 * `from '…'` (static import, `import type`, and `export … from`), `import '…'`
 * (side effect), `import('…')` (dynamic) and `require('…')` (CJS, including
 * TS's `import x = require('…')`).
 *
 * `\s*` rather than a single space throughout, because an import broken across
 * lines by a formatter is the same import. Matching the syntax rather than a
 * bare `'supertest'` string literal keeps prose out of the results — the three
 * pillars discuss supertest in a dozen file headers.
 */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)(['"])([^'"\n]+)\1/gu;

/** Posix-separated and repo-relative, so violations read the same on any host. */
const toPosix = (/** @type {string} */ path) => path.split(sep).join('/');

/**
 * Walk one directory tree for source files.
 *
 * Errors are returned, never swallowed: a directory this cannot read is a
 * broken walk, and a broken walk that reports zero violations is exactly the
 * shape ADR-045 exists to end.
 *
 * @param {string} root Absolute directory to walk.
 * @returns {{ files: string[], errors: string[] }} Absolute paths, and read failures.
 */
export function walkSourceFiles(root) {
  /** @type {string[]} */
  const files = [];
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const queue = [root];

  while (queue.length > 0) {
    const dir = /** @type {string} */ (queue.pop());
    /** @type {import('node:fs').Dirent[]} */
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      errors.push(`${toPosix(dir)} could not be read: ${/** @type {Error} */ (err).message}`);
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) queue.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) files.push(full);
    }
  }

  return { files, errors };
}

/**
 * The specifiers a pillar may not name: the package itself plus any dependency
 * aliased onto it. Subpaths of each are banned by the caller.
 *
 * @param {string} pillarRoot Absolute path to `pillars/<id>`.
 * @returns {{ specifiers: Set<string>, declared: boolean, error: string | null }}
 */
export function bannedSpecifiers(pillarRoot) {
  const manifestPath = join(pillarRoot, 'package.json');
  /** @type {unknown} */
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    return {
      specifiers: new Set([BANNED_PACKAGE]),
      declared: false,
      error: `${toPosix(relative(repoRoot, manifestPath))} could not be read or parsed: ${
        /** @type {Error} */ (err).message
      }`,
    };
  }

  const specifiers = new Set([BANNED_PACKAGE]);
  let declared = false;
  const record = /** @type {Record<string, unknown>} */ (manifest ?? {});
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const deps = record[field];
    if (typeof deps !== 'object' || deps === null) continue;
    for (const [name, spec] of Object.entries(deps)) {
      if (name === BANNED_PACKAGE) {
        declared = true;
        continue;
      }
      if (typeof spec !== 'string') continue;
      if (spec === `npm:${BANNED_PACKAGE}` || spec.startsWith(`npm:${BANNED_PACKAGE}@`)) {
        specifiers.add(name);
        declared = true;
      }
    }
  }

  return { specifiers, declared, error: null };
}

/**
 * @typedef {object} Hit
 * @property {string} specifier The module specifier as written.
 * @property {number} line      1-based.
 */

/**
 * Every banned specifier named by one source text.
 *
 * @param {string} text
 * @param {ReadonlySet<string>} banned
 * @returns {Hit[]}
 */
export function findBannedSpecifiers(text, banned) {
  /** @type {Hit[]} */
  const hits = [];
  for (const match of text.matchAll(SPECIFIER)) {
    const specifier = match[2];
    if (specifier === undefined) continue;
    const base = specifier.split('/')[0] ?? specifier;
    const scoped = specifier.startsWith('@')
      ? specifier.split('/').slice(0, 2).join('/')
      : /** @type {string} */ (base);
    if (!banned.has(scoped)) continue;
    const upto = text.slice(0, match.index);
    hits.push({ specifier, line: upto.split('\n').length });
  }
  return hits;
}

/**
 * Check every pillar against its transport.
 *
 * @param {string} root Repo root to check — the real tree, or a self-test fixture.
 * @returns {string[]} Human-readable violations; empty means clean.
 */
export function collectViolations(root) {
  /** @type {string[]} */
  const violations = [];

  for (const pillar of PILLARS) {
    const pillarRoot = join(root, 'pillars', pillar.id);

    const { specifiers, declared, error } = bannedSpecifiers(pillarRoot);
    if (error !== null) violations.push(error);
    else if (!declared) {
      violations.push(
        `${pillar.id} no longer declares \`${BANNED_PACKAGE}\` in pillars/${pillar.id}/package.json. ` +
          'This guard bans a package the pillar cannot resolve, which is a ban over nothing. ' +
          'Either restore the dependency or retire this pillar from PILLARS in this guard.'
      );
    }

    const { files, errors } = walkSourceFiles(pillarRoot);
    violations.push(...errors);

    if (files.length < pillar.minFiles) {
      violations.push(
        `pillars/${pillar.id} yielded ${String(files.length)} scannable source files, under its ` +
          `floor of ${String(pillar.minFiles)}. The pillar moved or the walk is broken — either ` +
          'way this guard is not reading what it claims to read.'
      );
      continue;
    }

    let transportMatched = false;

    for (const file of files) {
      const rel = toPosix(relative(root, file));
      /** @type {string} */
      let text;
      try {
        text = readFileSync(file, 'utf8');
      } catch (err) {
        violations.push(`${rel} could not be read: ${/** @type {Error} */ (err).message}`);
        continue;
      }

      const hits = findBannedSpecifiers(text, specifiers);
      if (hits.length === 0) continue;

      if (rel === pillar.transport) {
        transportMatched = true;
        continue;
      }

      for (const hit of hits) {
        violations.push(
          `${rel}:${String(hit.line)} imports \`${hit.specifier}\` directly. ` +
            `Use ${pillar.id}'s shared transport (${pillar.transport}) instead — a bare ` +
            '`request(app)` binds a fresh ephemeral server and dials a fresh connection per ' +
            'call, which is the churn the transport exists to remove. A type you need from ' +
            'the package should be re-exported by the transport rather than imported here.'
        );
      }
    }

    if (!transportMatched) {
      violations.push(
        `${pillar.transport} does not import \`${BANNED_PACKAGE}\`. That file is this guard's ` +
          'canary: it is the one place the package is expected, so a transport that no longer ' +
          'matches means either the transport moved (update PILLARS in this guard) or the ' +
          'specifier matcher has gone blind and is now reporting every pillar clean.'
      );
    }
  }

  return violations;
}

/* -------------------------------------------------------------------------- */

/**
 * Materialise a minimal but realistic pillar under `root`.
 *
 * @param {string} root
 * @param {PillarSpec} pillar
 * @param {{ transportImports?: boolean, fileCount?: number, aliasName?: string | null, declare?: boolean }} [options]
 */
function writeFixturePillar(root, pillar, options = {}) {
  const {
    transportImports = true,
    fileCount = pillar.minFiles + 5,
    aliasName = null,
    declare = true,
  } = options;
  const pillarRoot = join(root, 'pillars', pillar.id);
  // Replace rather than overlay, so a case that asks for one file gets one
  // file and not one file on top of whatever the clean fixture already laid
  // down. The floor case passed for exactly that reason on the first run.
  rmSync(pillarRoot, { recursive: true, force: true });

  /** @type {Record<string, string>} */
  const devDependencies = {};
  if (declare) devDependencies[BANNED_PACKAGE] = '^7.1.4';
  if (aliasName !== null) devDependencies[aliasName] = `npm:${BANNED_PACKAGE}@^7.1.4`;
  mkdirSync(pillarRoot, { recursive: true });
  writeFileSync(
    join(pillarRoot, 'package.json'),
    JSON.stringify({ name: `@pops/${pillar.id}`, devDependencies }, null, 2)
  );

  const transportAbs = join(root, ...pillar.transport.split('/'));
  mkdirSync(dirname(transportAbs), { recursive: true });
  writeFileSync(
    transportAbs,
    transportImports
      ? `import supertest from '${BANNED_PACKAGE}';\nexport const requestOn = supertest;\n`
      : 'export const requestOn = null;\n'
  );

  const filler = join(pillarRoot, 'src', 'filler');
  mkdirSync(filler, { recursive: true });
  for (let i = 0; i < fileCount; i += 1) {
    writeFileSync(
      join(filler, `mod-${String(i)}.ts`),
      `export const value${String(i)} = ${String(i)};\n`
    );
  }
}

/**
 * A fixture repo with every pillar clean.
 *
 * @param {string} root
 */
function writeCleanFixture(root) {
  for (const pillar of PILLARS) writeFixturePillar(root, pillar);
}

/** @param {string} root @param {string} rel @param {string} body */
function writeFile(root, rel, body) {
  const abs = join(root, ...rel.split('/'));
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
}

/**
 * @typedef {object} SelfTestCase
 * @property {string} name
 * @property {(root: string) => void} arrange
 * @property {RegExp | null} expect `null` means the tree must come back clean.
 */

/**
 * The adversarial matrix.
 *
 * Positive cases are the shapes a determined-but-careless author writes. The
 * degenerate cases are the ADR-045 half: the subject missing, gutted, or
 * unreadable must produce a deterministic violation, never silence.
 *
 * @returns {SelfTestCase[]}
 */
function selfTestCases() {
  const victim = 'pillars/purchases/src/api/__tests__/planted.test.ts';

  /** @param {string} body @param {string} [rel] @returns {(root: string) => void} */
  const plant =
    (body, rel = victim) =>
    (root) => {
      writeCleanFixture(root);
      writeFile(root, rel, body);
    };

  const caught = /planted|products\.test|helper\.ts|probe\.mts/u;

  return [
    { name: 'a clean tree reports nothing', arrange: writeCleanFixture, expect: null },

    {
      name: 'default import, single quotes',
      arrange: plant(`import request from 'supertest';\nrequest(1);\n`),
      expect: caught,
    },
    {
      name: 'default import, double quotes',
      arrange: plant(`import request from "supertest";\nrequest(1);\n`),
      expect: caught,
    },
    {
      name: 'namespace import',
      arrange: plant(`import * as request from 'supertest';\nrequest;\n`),
      expect: caught,
    },
    {
      name: 'side-effect import with no binding',
      arrange: plant(`import 'supertest';\n`),
      expect: caught,
    },
    {
      name: 'type-only import',
      arrange: plant(`import type { Response } from 'supertest';\nexport type R = Response;\n`),
      expect: caught,
    },
    {
      name: 'import broken across lines by a formatter',
      arrange: plant(`import request from\n  'supertest';\nrequest(1);\n`),
      expect: caught,
    },
    {
      name: 'CJS require',
      arrange: plant(`const request = require('supertest');\nrequest(1);\n`),
      expect: caught,
    },
    {
      name: 'dynamic import',
      arrange: plant(`const { default: request } = await import('supertest');\nrequest(1);\n`),
      expect: caught,
    },
    {
      name: 'subpath import',
      arrange: plant(`import Agent from 'supertest/lib/agent.js';\nAgent;\n`),
      expect: caught,
    },
    {
      name: 're-export from a sibling helper',
      arrange: plant(
        `export { default as request } from 'supertest';\n`,
        'pillars/purchases/src/api/__tests__/helper.ts'
      ),
      expect: caught,
    },
    {
      name: 'a test co-located beside its router, outside __tests__',
      arrange: plant(
        `import request from 'supertest';\nrequest(1);\n`,
        'pillars/purchases/src/api/products.test.ts'
      ),
      expect: caught,
    },
    {
      name: 'a non-.ts extension',
      arrange: plant(
        `import request from 'supertest';\nrequest(1);\n`,
        'pillars/purchases/src/api/probe.mts'
      ),
      expect: caught,
    },
    {
      name: 'a dependency aliased onto supertest, imported under its alias',
      arrange: (root) => {
        writeCleanFixture(root);
        writeFixturePillar(root, /** @type {PillarSpec} */ (PILLARS[2]), {
          aliasName: 'http-probe',
        });
        writeFile(root, victim, `import request from 'http-probe';\nrequest(1);\n`);
      },
      expect: caught,
    },
    {
      name: 'the transport itself is never reported',
      arrange: writeCleanFixture,
      expect: null,
    },

    {
      name: 'DEGENERATE: the transport file is gone',
      arrange: (root) => {
        writeCleanFixture(root);
        rmSync(join(root, .../** @type {PillarSpec} */ (PILLARS[1]).transport.split('/')));
      },
      expect: /does not import `supertest`/u,
    },
    {
      name: 'DEGENERATE: the transport no longer imports supertest',
      arrange: (root) => {
        writeCleanFixture(root);
        writeFixturePillar(root, /** @type {PillarSpec} */ (PILLARS[0]), {
          transportImports: false,
        });
      },
      expect: /canary/u,
    },
    {
      name: 'DEGENERATE: a pillar directory is missing entirely',
      arrange: (root) => {
        writeCleanFixture(root);
        rmSync(join(root, 'pillars', /** @type {PillarSpec} */ (PILLARS[2]).id), {
          recursive: true,
          force: true,
        });
      },
      expect: /under its floor of/u,
    },
    {
      name: 'DEGENERATE: the walk returns almost nothing',
      arrange: (root) => {
        writeCleanFixture(root);
        writeFixturePillar(root, /** @type {PillarSpec} */ (PILLARS[1]), { fileCount: 1 });
      },
      expect: /under its floor of/u,
    },
    {
      name: 'DEGENERATE: package.json is unparseable',
      arrange: (root) => {
        writeCleanFixture(root);
        writeFile(
          root,
          `pillars/${/** @type {PillarSpec} */ (PILLARS[0]).id}/package.json`,
          '{ not json'
        );
      },
      expect: /could not be read or parsed/u,
    },
    {
      name: 'DEGENERATE: the pillar dropped the dependency',
      arrange: (root) => {
        writeCleanFixture(root);
        writeFixturePillar(root, /** @type {PillarSpec} */ (PILLARS[2]), { declare: false });
      },
      expect: /no longer declares/u,
    },
  ];
}

/** @returns {boolean} true when every case behaved. */
function runSelfTest() {
  const cases = selfTestCases();
  let failures = 0;

  for (const testCase of cases) {
    const root = mkdtempSync(join(tmpdir(), 'supertest-adoption-'));
    try {
      testCase.arrange(root);
      const violations = collectViolations(root);
      const joined = violations.join('\n');
      const ok = testCase.expect === null ? violations.length === 0 : testCase.expect.test(joined);
      if (ok) {
        console.log(`  ok   ${testCase.name}`);
      } else {
        failures += 1;
        console.error(`  FAIL ${testCase.name}`);
        console.error(
          testCase.expect === null
            ? `       expected a clean tree, got:\n${joined}`
            : `       expected a violation matching ${String(testCase.expect)}, got:\n${
                joined === '' ? '       (nothing — the guard reported clean)' : joined
              }`
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  console.log(
    `\n${String(cases.length - failures)}/${String(cases.length)} self-test cases passed.`
  );
  return failures === 0;
}

const HELP = `check-supertest-transport-adoption — one door to supertest per pillar.

Nine pillars each own a pre-listened test transport: finance, bfm, purchases,
media, cerebrum, documents, ai, food and inventory. This fails the build when
any file in one of them imports \`supertest\` directly instead of going through
it, and equally when the transport itself stops matching — which would mean the
guard has gone blind rather than the tree gone clean.

  --self-test  Run the adversarial matrix (planted variants + degenerate cases).
  --help       This text.
`;

function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => a !== '--self-test' && a !== '--help');
  if (unknown.length > 0) {
    console.error(`Unknown argument(s): ${unknown.join(', ')}\n\n${HELP}`);
    process.exit(2);
  }
  if (args.includes('--help')) {
    console.log(HELP);
    return;
  }
  if (args.includes('--self-test')) {
    process.exit(runSelfTest() ? 0 : 1);
  }

  const violations = collectViolations(repoRoot);
  if (violations.length > 0) {
    console.error('supertest transport adoption — violations:\n');
    for (const violation of violations) console.error(`  - ${violation}`);
    console.error(
      `\n${String(violations.length)} violation(s). See AGENTS.md, "Conventions duplicated per pillar".`
    );
    process.exit(1);
  }
  console.log(
    `OK — ${String(PILLARS.length)} pillars reach supertest only through their own transport.`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
