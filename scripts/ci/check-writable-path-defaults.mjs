#!/usr/bin/env node
/**
 * Writable-path default guard.
 *
 * A pillar that resolves a filesystem location from the environment with a
 * *cwd-relative* fallback is one unset variable away from being unable to
 * write anything. The image's working directory is `/app`, `/app` is
 * root-owned, and the process runs as `node`, so the first `mkdir` under a
 * relative default fails with `EACCES: permission denied, mkdir 'data'`.
 * That is not theoretical: it is POPS-2735, where `MEDIA_IMAGES_DIR` was
 * unset in the media image and every poster 404'd while adding a movie 500'd.
 * POPS-2737 then found the same shape latent in food and inventory.
 *
 * The defence this guard enforces is the one that fixed media: the pillar's
 * own Dockerfile must (a) `mkdir -p` and `chown` the directory and (b) `ENV`
 * the variable to that absolute path. Both halves are required and neither
 * substitutes for the other — a path that is set but never created is
 * root-owned on a volume's first mount (POPS-1462), and a path that is
 * created but never named is exactly the poster-cache bug.
 *
 * Compose is deliberately NOT accepted as satisfying this. The compose file
 * that runs the fleet lives in a different repository (knoxio/homelab-infra,
 * `hosts/capivara/stacks/pops/docker-compose.yml`), so nothing in this repo
 * can check it, and `infra/docker-compose.yml` covering a variable proves
 * only that the dev stack is fine. The image must be correct standing alone.
 *
 * What this guard does NOT check:
 *   - That the absolute path is mounted as a volume. An unmounted path is
 *     writable but container-local, so it survives this guard and is lost on
 *     the next roll. Volume wiring lives in the homelab repo.
 *   - Paths not reached through an environment variable whose name ends in
 *     `_DIR`, `_PATH`, or `_ROOT`. A hard-coded relative path with no
 *     override is invisible here.
 *   - `VITE_`-prefixed variables anywhere. Vite exposes those to the browser
 *     by design; they are client config, not filesystem locations.
 *
 * `pillars/<id>/app/**` is held to a stricter rule than `src/**`, not exempted
 * from this one. Those trees are browser bundles served by the shell image:
 * they have no Dockerfile of their own, so no image can be made responsible
 * for a path they resolve, and they cannot read `process.env` in a browser
 * anyway. Any env-backed filesystem path there is therefore a violation
 * regardless of whether its default is absolute — there is no correct way to
 * write one. POPS-2741 is where that hole was found: a Node-only duplicate of
 * the food path helpers sat in an app tree for months, dead but carrying the
 * exact POPS-2735 defect, with no gate able to see it.
 *
 * Usage:
 *   node scripts/ci/check-writable-path-defaults.mjs
 *   node scripts/ci/check-writable-path-defaults.mjs --self-test
 *
 * Exit 0 = clean. Exit 1 = at least one unguarded default. Exit 2 = usage error.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const PILLARS_DIR = join(repoRoot, 'pillars');

/** Environment variables whose name marks them as naming a filesystem location. */
const PATH_ENV_SUFFIX = /_(DIR|PATH|ROOT)$/;

/**
 * Shape of an environment variable NAME, as opposed to a value: SCREAMING_SNAKE
 * and nothing else. Used to recognise a name handed to a lookup wrapper, where
 * there is no `process.env` node to match on.
 */
const ENV_VAR_NAME = /^[A-Z][A-Z0-9_]*$/;

/**
 * Variables Vite hands to the browser. `VITE_ASSET_PATH` is a URL prefix, not
 * a directory, so matching it on the suffix rule alone would be a false
 * positive in exactly the trees the app rule below scrutinises hardest.
 */
const CLIENT_ENV_PREFIX = /^VITE_/;

/**
 * True when a variable name denotes a filesystem location this guard governs.
 *
 * @param {string} name
 * @returns {boolean}
 */
function isFilesystemPathVar(name) {
  return PATH_ENV_SUFFIX.test(name) && !CLIENT_ENV_PREFIX.test(name);
}

/**
 * Classify a string literal as a filesystem path, or reject it as not one.
 *
 * Rejects URLs and anything without a path separator, so a function that
 * happens to mention `http://media-api:3003` or `'production'` alongside a
 * genuine default is not misread as having a relative one.
 *
 * @param {string} value
 * @returns {'absolute' | 'relative' | null}
 */
export function classifyPathLiteral(value) {
  if (value.length === 0) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return null;
  if (value.startsWith('/')) return 'absolute';
  if (value.startsWith('./') || value.startsWith('../')) return 'relative';
  // A bare `data/food/recipes` is as cwd-relative as `./data/food/recipes`.
  if (/^[\w.@-]+(\/[\w.@-]+)+$/.test(value)) return 'relative';
  return null;
}

/**
 * Build a map of module-level `const NAME = '<string>'` initialisers.
 *
 * Needed because every real resolver in this repo puts its default in a
 * module constant (`DEFAULT_FOOD_RECIPES_DIR`) and some put the *variable
 * name* in one too (cerebrum's `ENGRAM_ROOT_ENV`).
 *
 * @param {ts.SourceFile} sourceFile
 * @returns {Map<string, string>}
 */
function collectStringConstants(sourceFile) {
  /** @type {Map<string, string>} */
  const constants = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) continue;
      if (decl.initializer && ts.isStringLiteral(decl.initializer)) {
        constants.set(decl.name.text, decl.initializer.text);
      }
    }
  }
  return constants;
}

/**
 * Extract the environment variable name a `process.env.X` / `env['X']` style
 * access refers to, or null if the node is not such an access.
 *
 * @param {ts.Node} node
 * @param {Map<string, string>} constants
 * @returns {string | null}
 */
function envVarNameOf(node, constants) {
  if (ts.isPropertyAccessExpression(node)) {
    // `process.env.FOO` — and any `env.FOO` on an injected ProcessEnv.
    const objectText = node.expression.getText();
    if (objectText === 'process.env' || objectText === 'env') return node.name.text;
    return null;
  }
  if (ts.isElementAccessExpression(node)) {
    const objectText = node.expression.getText();
    if (objectText !== 'process.env' && objectText !== 'env') return null;
    const arg = node.argumentExpression;
    if (ts.isStringLiteral(arg)) return arg.text;
    if (ts.isIdentifier(arg)) return constants.get(arg.text) ?? null;
    return null;
  }
  return null;
}

/**
 * Scan one scope (a function body, or a single module-level variable
 * statement) for env-backed path resolution.
 *
 * @param {ts.Node} scope
 * @param {Map<string, string>} constants
 * @returns {{ envVars: string[], relativeDefaults: string[], absoluteDefaults: string[] }}
 */
function scanScope(scope, constants) {
  /** @type {Set<string>} */
  const envVars = new Set();
  /** @type {Set<string>} */
  const relativeDefaults = new Set();
  /** @type {Set<string>} */
  const absoluteDefaults = new Set();

  /** @param {string} value */
  const noteLiteral = (value) => {
    const kind = classifyPathLiteral(value);
    if (kind === 'relative') relativeDefaults.add(value);
    else if (kind === 'absolute') absoluteDefaults.add(value);
  };

  /** @param {ts.Node} node */
  const visit = (node) => {
    const envName = envVarNameOf(node, constants);
    if (envName !== null && isFilesystemPathVar(envName)) envVars.add(envName);

    if (ts.isStringLiteral(node)) {
      // A bare `'MEDIA_IMAGES_DIR'` is a variable NAME, not a path. Matching it
      // is what lets this guard see a resolver that reads through a wrapper:
      // `getEnv('MEDIA_IMAGES_DIR')` has no `process.env` node to match on, and
      // media — the pillar that produced POPS-2735 — is written exactly that
      // way, so the originating case was invisible until this branch existed.
      if (ENV_VAR_NAME.test(node.text) && isFilesystemPathVar(node.text)) {
        envVars.add(node.text);
      } else {
        noteLiteral(node.text);
      }
    }

    // `join(process.cwd(), 'data', 'engrams')` is cwd-relative however it is
    // spelled, so it counts as a relative default even with no `./` literal.
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText();
      if (/(^|\.)(join|resolve)$/.test(callee)) {
        const usesCwd = node.arguments.some((arg) => arg.getText() === 'process.cwd()');
        if (usesCwd) {
          const segments = node.arguments
            .slice(1)
            .filter(ts.isStringLiteral)
            .map((arg) => arg.text);
          relativeDefaults.add(`process.cwd()/${segments.join('/')}`);
        }
      }
    }

    // A module constant referenced by name carries its literal value in.
    if (ts.isIdentifier(node) && constants.has(node.text)) {
      const value = constants.get(node.text);
      if (value !== undefined) noteLiteral(value);
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(scope, visit);
  return {
    envVars: [...envVars].toSorted(),
    relativeDefaults: [...relativeDefaults].toSorted(),
    absoluteDefaults: [...absoluteDefaults].toSorted(),
  };
}

/**
 * Find every env-backed path resolver with a cwd-relative default in one file.
 *
 * @param {string} fileName  Used only for diagnostics.
 * @param {string} source
 * @returns {{ findings: { where: string, envVars: string[], relativeDefaults: string[] }[], resolvers: { where: string, envVars: string[], relativeDefaults: string[] }[], resolversSeen: number, unparseable: boolean }}
 */
export function findRelativeDefaults(fileName, source) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.ESNext, true);
  // A file TypeScript could not parse yields a partial tree, and a partial
  // tree is how this guard would silently stop seeing a resolver it used to
  // cover (ADR-045: a shape the guard cannot model is a violation, not a
  // pass). Report it rather than scanning the wreckage.
  // `parseDiagnostics` is not on the public SourceFile type, so it is read
  // reflectively rather than through a cast that would lie about the shape.
  const parseDiagnostics = /** @type {{ length: number } | undefined} */ (
    Reflect.get(sourceFile, 'parseDiagnostics')
  );
  if (parseDiagnostics !== undefined && parseDiagnostics.length > 0) {
    return {
      resolversSeen: 0,
      unparseable: true,
      findings: [],
      resolvers: [],
    };
  }

  const constants = collectStringConstants(sourceFile);
  /** @type {{ where: string, envVars: string[], relativeDefaults: string[] }[]} */
  const findings = [];
  /** Every env-backed path resolver, relative default or not. */
  /** @type {{ where: string, envVars: string[], relativeDefaults: string[] }[]} */
  const resolvers = [];
  let resolversSeen = 0;

  /** @param {ts.Node} scope @param {string} label */
  const consider = (scope, label) => {
    const { envVars, relativeDefaults } = scanScope(scope, constants);
    if (envVars.length === 0) return;
    // Counted whether or not its default is relative: this is the signal that
    // the AST walk still recognises the subject at all.
    resolversSeen += 1;
    resolvers.push({ where: label, envVars, relativeDefaults });
    if (relativeDefaults.length === 0) return;
    findings.push({ where: label, envVars, relativeDefaults });
  };

  /** @param {ts.Node} node */
  const visit = (node) => {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node) ||
      ts.isMethodDeclaration(node)
    ) {
      const name = ts.isFunctionDeclaration(node) && node.name ? node.name.text : '<anonymous>';
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      consider(node, `${name}() at line ${line}`);
      return; // Nested scopes are covered by the outer scan.
    }
    ts.forEachChild(node, visit);
  };

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      // `consider` scans the whole subtree, so a `const f = () => …` resolver
      // is already covered here. Descending as well would scan it twice —
      // reporting one violation as two and inflating the resolver counter the
      // discovery floor is measured against.
      const line = sourceFile.getLineAndCharacterOfPosition(statement.getStart()).line + 1;
      consider(statement, `module-level statement at line ${line}`);
      continue;
    }
    visit(statement);
  }
  return { findings, resolvers, resolversSeen, unparseable: false };
}

/**
 * Parse the `ENV` assignments and created/chowned directories out of a
 * Dockerfile.
 *
 * @param {string} source
 * @returns {{ env: Map<string, string>, created: string[], chowned: string[] }}
 */
export function parseDockerfile(source) {
  // Fold line continuations so a multi-line RUN is one logical instruction.
  const logical = source.replace(/\\\r?\n\s*/g, ' ').split(/\r?\n/);
  /** @type {Map<string, string>} */
  const env = new Map();
  /** @type {string[]} */
  const created = [];
  /** @type {string[]} */
  const chowned = [];

  for (const rawLine of logical) {
    const line = rawLine.trim();
    if (line.startsWith('#') || line.length === 0) continue;

    const envMatch = /^ENV\s+(.*)$/i.exec(line);
    if (envMatch) {
      const body = envMatch[1];
      if (body.includes('=')) {
        for (const pair of body.match(/[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)/g) ?? []) {
          const eq = pair.indexOf('=');
          const name = pair.slice(0, eq);
          const value = pair.slice(eq + 1).replace(/^["']|["']$/g, '');
          env.set(name, value);
        }
      } else {
        // Legacy `ENV NAME value` form.
        const [name, ...rest] = body.split(/\s+/);
        if (name && rest.length > 0) env.set(name, rest.join(' ').replace(/^["']|["']$/g, ''));
      }
      continue;
    }

    if (/^RUN\s/i.test(line)) {
      for (const mkdir of line.matchAll(/mkdir\s+(?:-\S+\s+)*([^&|;]+)/g)) {
        for (const token of mkdir[1].trim().split(/\s+/)) {
          if (token.startsWith('-')) continue;
          if (token.startsWith('/')) created.push(posix.normalize(token));
        }
      }
      for (const chown of line.matchAll(/chown\s+(?:-\S+\s+)*\S+:\S+\s+([^&|;]+)/g)) {
        for (const token of chown[1].trim().split(/\s+/)) {
          if (token.startsWith('/')) chowned.push(posix.normalize(token));
        }
      }
    }
  }
  return { env, created, chowned };
}

/**
 * Decide whether a Dockerfile guards one relative-default finding.
 *
 * @param {{ envVars: string[], relativeDefaults: string[] }} finding
 * @param {{ env: Map<string, string>, created: string[], chowned: string[] }} dockerfile
 * @returns {{ ok: true, via: string } | { ok: false, reason: string }}
 */
export function evaluateFinding(finding, dockerfile) {
  /** @type {string[]} */
  const problems = [];
  for (const name of finding.envVars) {
    const value = dockerfile.env.get(name);
    if (value === undefined) {
      problems.push(`${name} is never set by ENV`);
      continue;
    }
    if (!value.startsWith('/')) {
      problems.push(`ENV ${name}=${value} is itself relative`);
      continue;
    }
    const isDirVar = /_(DIR|ROOT)$/.test(name);
    const wanted = isDirVar ? [value] : [value, posix.dirname(value)];
    const createdMatch = wanted.find((candidate) => dockerfile.created.includes(candidate));
    if (createdMatch === undefined) {
      problems.push(
        `ENV ${name}=${value} but no RUN mkdir creates ${isDirVar ? value : wanted.join(' or ')}`
      );
      continue;
    }
    const chownMatch = dockerfile.chowned.some(
      (root) => createdMatch === root || createdMatch.startsWith(`${root}/`)
    );
    if (!chownMatch) {
      problems.push(`ENV ${name}=${value} creates ${createdMatch} but never chowns it`);
      continue;
    }
    return { ok: true, via: `${name}=${value}` };
  }
  return { ok: false, reason: problems.join('; ') };
}

/**
 * Recursively list runtime `.ts` files under a directory, skipping tests.
 *
 * @param {string} dir
 * @returns {string[]}
 */
export function listRuntimeSources(dir) {
  if (!existsSync(dir)) return [];
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      out.push(...listRuntimeSources(full));
      continue;
    }
    // `.tsx` matters as much as `.ts`: an app tree is overwhelmingly TSX, so a
    // `.ts`-only sweep left ~860 files unscanned and made the app rule below
    // very nearly vacuous. `createSourceFile` picks the TSX parser off the
    // file name, so the extension has to survive into `findRelativeDefaults`.
    if (!/\.tsx?$/.test(entry.name) || entry.name.endsWith('.d.ts')) continue;
    if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

/**
 * Minimum subjects a healthy scan must find.
 *
 * ADR-045: a guard that iterates a discovered set must fail when the set is
 * empty rather than reporting OK over a repo it can no longer read. Both
 * numbers are far below today's counts (16 pillars, 20 resolvers) and exist
 * to catch total discovery loss — a moved `pillars/` tree, a renamed source
 * layout, an AST walk that stops matching `process.env` — not to track growth.
 */
const DISCOVERY_FLOOR = { pillars: 8, resolvers: 10 };

/**
 * Minimum `.tsx` files the lister must still collect from app trees.
 *
 * App trees hold ~860 today. The floor exists so that dropping `.tsx` from the
 * extension filter — which leaves every parser fixture green — fails loudly
 * instead of quietly scanning almost nothing.
 */
const TSX_FLOOR = 100;

/** Pillar directory names, for the self-test's assertions against the real tree. */
const PILLAR_NAMES = existsSync(PILLARS_DIR)
  ? readdirSync(PILLARS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  : [];

/**
 * Run the guard over the repository.
 *
 * @returns {{ violations: { pillar: string, file: string, where: string, envVars: string[], relativeDefaults: string[], reason: string }[], pillarsScanned: number, resolversSeen: number }}
 */
/**
 * @typedef {{
 *   pillar: string,
 *   file: string,
 *   where: string,
 *   envVars: string[],
 *   relativeDefaults: string[],
 *   reason: string,
 * }} Violation
 */

/**
 * Scan one pillar's already-loaded sources.
 *
 * Pure, and exported, so the self-test can drive the combinations the real
 * tree does not currently contain — notably a pillar whose `src/` is empty but
 * whose `app/src/` holds a resolver. That case used to be skipped outright:
 * the app scan sat behind an early `continue` on an empty `src/`, which made
 * "an app tree must never resolve a filesystem path" conditional on the
 * pillar having a backend at all.
 *
 * @param {{
 *   pillar: string,
 *   srcFiles: { file: string, source: string }[],
 *   appFiles: { file: string, source: string }[],
 *   dockerfile: { env: Map<string, string>, created: string[], chowned: string[] } | null,
 * }} input
 * @returns {{ violations: Violation[], resolversSeen: number }}
 */
export function scanPillar({ pillar, srcFiles, appFiles, dockerfile }) {
  /** @type {Violation[]} */
  const violations = [];
  let resolversSeen = 0;

  /** @param {string} file @returns {Violation} */
  const unparseable = (file) => ({
    pillar,
    file,
    where: 'whole file',
    envVars: [],
    relativeDefaults: [],
    reason: 'TypeScript could not parse this file, so it was not checked',
  });

  for (const { file, source } of srcFiles) {
    const scan = findRelativeDefaults(file, source);
    resolversSeen += scan.resolversSeen;
    if (scan.unparseable) {
      violations.push(unparseable(file));
      continue;
    }
    for (const finding of scan.findings) {
      if (dockerfile === null) {
        violations.push({
          pillar,
          file,
          where: finding.where,
          envVars: finding.envVars,
          relativeDefaults: finding.relativeDefaults,
          reason: `pillars/${pillar}/Dockerfile does not exist, so nothing can set these`,
        });
        continue;
      }
      const verdict = evaluateFinding(finding, dockerfile);
      if (!verdict.ok) {
        violations.push({
          pillar,
          file,
          where: finding.where,
          envVars: finding.envVars,
          relativeDefaults: finding.relativeDefaults,
          reason: verdict.reason,
        });
      }
    }
  }

  // Unconditional, and deliberately not nested under the loop above: an app
  // tree is a browser bundle with no Dockerfile, so no image can be held
  // responsible for a path it resolves and an absolute default is no more
  // correct than a relative one. Resolving a filesystem path here is the
  // violation, whatever the pillar's `src/` does or does not contain.
  for (const { file, source } of appFiles) {
    const scan = findRelativeDefaults(file, source);
    resolversSeen += scan.resolversSeen;
    if (scan.unparseable) {
      violations.push(unparseable(file));
      continue;
    }
    for (const resolver of scan.resolvers) {
      violations.push({
        pillar,
        file,
        where: resolver.where,
        envVars: resolver.envVars,
        relativeDefaults: resolver.relativeDefaults,
        reason:
          'an app tree is browser-bundled and has no image, so it must not resolve a ' +
          'filesystem path from the environment at all',
      });
    }
  }

  return { violations, resolversSeen };
}

/**
 * Discover pillar directory names.
 *
 * Not an existsSync skip: a missing `pillars/` tree must reach the discovery
 * floor as zero and be reported, never crash with a readdir stack trace and
 * never be swallowed into a clean result (ADR-045).
 *
 * @returns {string[]}
 */
function defaultListPillars() {
  return existsSync(PILLARS_DIR)
    ? readdirSync(PILLARS_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .toSorted()
    : [];
}

/**
 * Read one pillar's runtime sources from disk.
 *
 * @param {string} pillar
 * @param {'src' | 'app'} tree
 * @returns {{ file: string, source: string }[]}
 */
function defaultLoadSources(pillar, tree) {
  const dir =
    tree === 'src' ? join(PILLARS_DIR, pillar, 'src') : join(PILLARS_DIR, pillar, 'app', 'src');
  return listRuntimeSources(dir).map((path) => ({
    file: path.slice(repoRoot.length + 1),
    source: readFileSync(path, 'utf8'),
  }));
}

/**
 * Read and parse one pillar's Dockerfile, or null when it has none.
 *
 * @param {string} pillar
 * @returns {{ env: Map<string, string>, created: string[], chowned: string[] } | null}
 */
function defaultLoadDockerfile(pillar) {
  const dockerfilePath = join(PILLARS_DIR, pillar, 'Dockerfile');
  return existsSync(dockerfilePath) ? parseDockerfile(readFileSync(dockerfilePath, 'utf8')) : null;
}

/**
 * Run the guard over the repository.
 *
 * The three readers are injectable so the self-test can drive THIS function —
 * skip guard and all — over a synthetic tree. Testing the extracted
 * `scanPillar` instead is not equivalent: the bug that shipped lived in the
 * `continue` below, and a test that calls `scanPillar` directly stays green
 * while that line is wrong.
 *
 * @param {{
 *   listPillars?: () => string[],
 *   loadSources?: (pillar: string, tree: 'src' | 'app') => { file: string, source: string }[],
 *   loadDockerfile?: (pillar: string) => { env: Map<string, string>, created: string[], chowned: string[] } | null,
 * }} [deps]
 * @returns {{ violations: Violation[], pillarsScanned: number, resolversSeen: number }}
 */
export function run(deps = {}) {
  const {
    listPillars = defaultListPillars,
    loadSources = defaultLoadSources,
    loadDockerfile = defaultLoadDockerfile,
  } = deps;

  /** @type {Violation[]} */
  const violations = [];
  let pillarsScanned = 0;
  let resolversSeen = 0;

  for (const pillar of listPillars()) {
    const srcFiles = loadSources(pillar, 'src');
    const appFiles = loadSources(pillar, 'app');
    // Both trees, not just `src`: a pillar with no backend still has an app
    // tree that must never resolve a filesystem path.
    if (srcFiles.length === 0 && appFiles.length === 0) continue;
    pillarsScanned += 1;

    const scanned = scanPillar({
      pillar,
      srcFiles,
      appFiles,
      dockerfile: loadDockerfile(pillar),
    });
    violations.push(...scanned.violations);
    resolversSeen += scanned.resolversSeen;
  }
  return { violations, pillarsScanned, resolversSeen };
}

const USAGE =
  'Usage: node scripts/ci/check-writable-path-defaults.mjs [--self-test]\n' +
  '  --self-test  Exercise the classifier against fixtures instead of the repo.\n';

/**
 * @typedef {{ kind: 'help' } | { kind: 'self-test' } | { kind: 'run' } | { kind: 'error', message: string }} ParsedArgs
 */

/**
 * Parse argv.
 *
 * Anything unrecognised is an error rather than being ignored: silently
 * dropping a typo'd `--self-tests` would run the real check and a clean tree
 * would then read as "the self-test passed".
 *
 * @param {string[]} args
 * @returns {ParsedArgs}
 */
export function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { kind: 'help' };
  const unrecognised = args.filter((arg) => arg !== '--self-test');
  if (unrecognised.length > 0) {
    return { kind: 'error', message: `unknown argument: ${unrecognised[0]}` };
  }
  return args.includes('--self-test') ? { kind: 'self-test' } : { kind: 'run' };
}

/** The media resolver exactly as it read when POPS-2735 took production down. */
const FIXTURE_POSTER_CACHE = `
const DEFAULT_MEDIA_IMAGES_DIR = './data/media/images';
export function getMediaImagesDir(): string {
  return resolve(process.env['MEDIA_IMAGES_DIR'] ?? DEFAULT_MEDIA_IMAGES_DIR);
}
`;

/**
 * media's shape: the variable name reaches a wrapper as a string, so there is
 * no `process.env` node anywhere in the resolver. This is how the pillar that
 * produced POPS-2735 stayed invisible to the first version of this guard.
 */
const FIXTURE_WRAPPED_ENV = `
const DEFAULT_MEDIA_IMAGES_DIR = './data/media/images';
export function getMediaImagesDir(): string {
  return getEnv('MEDIA_IMAGES_DIR') ?? DEFAULT_MEDIA_IMAGES_DIR;
}
`;

/**
 * A resolver hidden in a TSX file. An app tree is overwhelmingly `.tsx`, so a
 * `.ts`-only sweep made the app rule very nearly vacuous — the JSX here is
 * what proves the file is parsed as TSX rather than reported unparseable.
 */
const FIXTURE_TSX_RESOLVER = `
const DEFAULT_DIR = './data/thing';
export function thingDir(): string {
  return process.env['THING_DIR'] ?? DEFAULT_DIR;
}
export const Panel = () => <div className="p">{thingDir()}</div>;
`;

/** The SQLite ladder: a pillar-specific var, then a shared one, then a default. */
const FIXTURE_LADDER = `
export const DEFAULT_FOOD_SQLITE_PATH = './data/food.db';
export function resolveFoodSqlitePath(): string {
  const envPath = process.env['FOOD_SQLITE_PATH'];
  if (envPath !== undefined && envPath !== '') return envPath;
  const sharedPath = process.env['SQLITE_PATH'];
  if (sharedPath !== undefined && sharedPath !== '') return sharedPath;
  return DEFAULT_FOOD_SQLITE_PATH;
}
`;

/** cwd-relative without ever writing `./` — the shape a literal scan misses. */
const FIXTURE_CWD_JOIN = `
export const ENGRAM_ROOT_ENV = 'CEREBRUM_ENGRAMS_DIR';
export function resolveEngramRoot(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env[ENGRAM_ROOT_ENV];
  if (configured !== undefined && configured !== '') return configured;
  return join(process.cwd(), 'data', 'engrams');
}
`;

/** An absolute default needs no image support at all. */
const FIXTURE_ABSOLUTE = `
export function ingestDir(): string {
  return process.env['FOOD_INGEST_DIR'] ?? '/data/food/ingest';
}
`;

/** A URL and a plain word must not be mistaken for relative paths. */
const FIXTURE_NON_PATHS = `
export function selfBaseUrl(): string {
  const dir = process.env['MEDIA_SELF_DIR'];
  if (dir !== undefined) return dir;
  return 'http://media-api:3003';
}
`;

const DOCKERFILE_GOOD = `
FROM node:24-slim
WORKDIR /app
RUN mkdir -p /data/sqlite /data/media/images && chown -R node:node /data
ENV SQLITE_PATH=/data/sqlite/pops.db
ENV MEDIA_IMAGES_DIR=/data/media/images
USER node
`;

const DOCKERFILE_ENV_ONLY = `
FROM node:24-slim
RUN mkdir -p /data/sqlite && chown -R node:node /data
ENV MEDIA_IMAGES_DIR=/data/media/images
`;

const DOCKERFILE_MKDIR_ONLY = `
FROM node:24-slim
RUN mkdir -p /data/sqlite /data/media/images && chown -R node:node /data
ENV SQLITE_PATH=/data/sqlite/pops.db
`;

const DOCKERFILE_NO_CHOWN = `
FROM node:24-slim
RUN mkdir -p /data/media/images
ENV MEDIA_IMAGES_DIR=/data/media/images
`;

/**
 * Exercise the guard against fixtures whose verdict is known.
 *
 * Every case here is a shape this repository actually produced or that the
 * checker could plausibly get wrong, not a restatement of the implementation.
 *
 * @returns {boolean} True when every fixture lands on its expected verdict.
 */
function selfTest() {
  const good = parseDockerfile(DOCKERFILE_GOOD);
  const envOnly = parseDockerfile(DOCKERFILE_ENV_ONLY);
  const mkdirOnly = parseDockerfile(DOCKERFILE_MKDIR_ONLY);
  const noChown = parseDockerfile(DOCKERFILE_NO_CHOWN);

  const poster = findRelativeDefaults('poster.ts', FIXTURE_POSTER_CACHE).findings;
  const ladder = findRelativeDefaults('ladder.ts', FIXTURE_LADDER).findings;
  const cwdJoin = findRelativeDefaults('engrams.ts', FIXTURE_CWD_JOIN).findings;
  const absolute = findRelativeDefaults('ingest.ts', FIXTURE_ABSOLUTE).findings;
  const nonPaths = findRelativeDefaults('url.ts', FIXTURE_NON_PATHS).findings;

  const detectsPoster = poster.length === 1 && poster[0].envVars.includes('MEDIA_IMAGES_DIR');
  const detectsLadder =
    ladder.length === 1 &&
    ladder[0].envVars.includes('FOOD_SQLITE_PATH') &&
    ladder[0].envVars.includes('SQLITE_PATH');
  const detectsCwdJoin =
    cwdJoin.length === 1 && cwdJoin[0].envVars.includes('CEREBRUM_ENGRAMS_DIR');
  const ignoresAbsolute = absolute.length === 0;
  const ignoresNonPaths = nonPaths.length === 0;

  // The fix that closed POPS-2735 must read as clean.
  const posterFixed = detectsPoster && evaluateFinding(poster[0], good).ok;
  // The ladder is satisfied by the SHARED variable, not its own.
  const ladderViaShared =
    detectsLadder && evaluateFinding(ladder[0], good).ok && good.env.has('SQLITE_PATH');
  // The state production was actually in: created but never named.
  const catchesMkdirOnly = detectsPoster && !evaluateFinding(poster[0], mkdirOnly).ok;
  // Named but never created — root-owned on a volume's first mount.
  const catchesEnvOnly = detectsPoster && !evaluateFinding(poster[0], envOnly).ok;
  // Created and named but left root-owned.
  const catchesNoChown = detectsPoster && !evaluateFinding(poster[0], noChown).ok;

  const literalsOk =
    classifyPathLiteral('./data/media/images') === 'relative' &&
    classifyPathLiteral('data/media/images') === 'relative' &&
    classifyPathLiteral('/data/media/images') === 'absolute' &&
    classifyPathLiteral('http://media-api:3003') === null &&
    classifyPathLiteral('production') === null;

  // A multi-line RUN must fold before it is scanned.
  const folded = parseDockerfile(
    'RUN mkdir -p /data/sqlite \\\n    /data/inventory/images \\\n && chown -R node:node /data\n'
  );
  const foldingOk =
    folded.created.includes('/data/inventory/images') && folded.chowned.includes('/data');

  // --- Degenerate cases (ADR-045): the guard must REPORT, not fall silent,
  // when its subject is missing, malformed, or no longer recognised.

  // A source TypeScript cannot parse must not be scanned as if it were fine.
  const brokenScan = findRelativeDefaults(
    'broken.ts',
    "export function x(): string { return process.env['A_DIR'] ?? './data/a' "
  );
  const catchesUnparseable = brokenScan.unparseable && brokenScan.findings.length === 0;

  // An absolute default still counts as a resolver seen — that counter is what
  // detects an AST walk which has stopped matching anything at all.
  const countsResolversSeen =
    findRelativeDefaults('ingest.ts', FIXTURE_ABSOLUTE).resolversSeen === 1 &&
    findRelativeDefaults('empty.ts', 'export const x = 1;\n').resolversSeen === 0;

  // A Dockerfile with nothing in it must fail the finding, never pass it.
  const catchesEmptyDockerfile =
    detectsPoster && !evaluateFinding(poster[0], parseDockerfile('')).ok;

  // A repo scan that discovers nothing must not be able to report clean: the
  // floor is above zero, so an empty result trips it.
  const floorIsAboveZero = DISCOVERY_FLOOR.pillars > 0 && DISCOVERY_FLOOR.resolvers > 0;

  // And the real scan must clear that floor, or the floor is fiction.
  const realScan = run();
  const realScanClearsFloor =
    realScan.pillarsScanned >= DISCOVERY_FLOOR.pillars &&
    realScan.resolversSeen >= DISCOVERY_FLOOR.resolvers;

  // A `const f = () => …` resolver sits inside a module-level statement AND is
  // a function scope, so a naive walk scans it twice: one violation reported
  // as two, and a resolver counter inflated above the floor it is checked
  // against. Every resolver in the repo today is a function declaration, so
  // only a fixture can hold this shape.
  const arrowConst = findRelativeDefaults(
    'arrow.ts',
    "export const root = (): string => process.env['X_DIR'] ?? './data/x';\n"
  );
  const scansEachResolverOnce = arrowConst.findings.length === 1 && arrowConst.resolversSeen === 1;
  // An app tree must not resolve a filesystem path at all — an absolute
  // default is no more correct there than a relative one, because no image
  // owns the path (POPS-2741).
  const appAbsolute = findRelativeDefaults('app.ts', FIXTURE_ABSOLUTE);
  const appRuleSeesAbsolute =
    appAbsolute.resolvers.length === 1 && appAbsolute.findings.length === 0;

  // Vite's own variables are client config, not directories.
  const ignoresViteVars =
    findRelativeDefaults(
      'vite.ts',
      "export const p = process.env['VITE_ASSET_PATH'] ?? './assets';\n"
    ).resolvers.length === 0;

  // A resolver that reads through a lookup wrapper must still be seen.
  const wrapped = findRelativeDefaults('wrapped.ts', FIXTURE_WRAPPED_ENV).findings;
  const seesWrappedEnvReads =
    wrapped.length === 1 &&
    wrapped[0].envVars.includes('MEDIA_IMAGES_DIR') &&
    evaluateFinding(wrapped[0], good).ok;

  // The parser cases below prove TSX is understood; this proves it is
  // COLLECTED. Reverting the lister's extension filter leaves every parser
  // fixture green, so without an assertion against the real tree the .tsx
  // hole could reopen silently — which is how it shipped in the first place.
  const tsxCollected = PILLAR_NAMES.flatMap((pillar) =>
    listRuntimeSources(join(PILLARS_DIR, pillar, 'app', 'src'))
  ).filter((file) => file.endsWith('.tsx'));
  const collectsTsxFromAppTrees = tsxCollected.length >= TSX_FLOOR;

  // TSX must parse as TSX and be scanned like any other source.
  const tsxScan = findRelativeDefaults('Panel.tsx', FIXTURE_TSX_RESOLVER);
  const scansTsx =
    !tsxScan.unparseable &&
    tsxScan.findings.length === 1 &&
    tsxScan.findings[0].envVars.includes('THING_DIR');
  // The same source under a `.ts` name is genuinely unparseable (the arrow
  // generic and JSX collide), which is what makes the extension load-bearing
  // rather than cosmetic.
  const tsxNeedsItsExtension = findRelativeDefaults('Panel.ts', FIXTURE_TSX_RESOLVER).unparseable;

  // A pillar with no backend sources at all must still have its app tree
  // scanned. This combination does not exist in the repo today, so only a
  // synthetic tree can hold the guard to its own "regardless" wording — and
  // it is driven through run() rather than scanPillar, because the bug being
  // pinned lived in run()'s own skip guard. A scanPillar-only test stays green
  // while that `continue` is wrong, which is the whole failure this case
  // exists to prevent.
  const appOnlyRun = run({
    listPillars: () => ['ghost'],
    loadSources: (_pillar, tree) =>
      tree === 'app'
        ? [{ file: 'pillars/ghost/app/src/paths.ts', source: FIXTURE_POSTER_CACHE }]
        : [],
    loadDockerfile: () => null,
  });
  const scansAppTreeWithoutSrc =
    appOnlyRun.violations.length === 1 && appOnlyRun.pillarsScanned === 1;

  // The mirror case: a pillar with neither tree is skipped, so the injected
  // readers cannot make every pillar count and hide a discovery collapse.
  const emptyPillarRun = run({
    listPillars: () => ['ghost'],
    loadSources: () => [],
    loadDockerfile: () => null,
  });
  const skipsEmptyPillar =
    emptyPillarRun.pillarsScanned === 0 && emptyPillarRun.violations.length === 0;

  const helpOk = parseArgs(['--help']).kind === 'help';
  const selfTestOk = parseArgs(['--self-test']).kind === 'self-test';
  const runOk = parseArgs([]).kind === 'run';
  const unknownArgOk = parseArgs(['--self-tests']).kind === 'error';

  const allOk =
    detectsPoster &&
    detectsLadder &&
    detectsCwdJoin &&
    ignoresAbsolute &&
    ignoresNonPaths &&
    posterFixed &&
    ladderViaShared &&
    catchesMkdirOnly &&
    catchesEnvOnly &&
    catchesNoChown &&
    literalsOk &&
    foldingOk &&
    catchesUnparseable &&
    countsResolversSeen &&
    appRuleSeesAbsolute &&
    ignoresViteVars &&
    catchesEmptyDockerfile &&
    scansEachResolverOnce &&
    seesWrappedEnvReads &&
    collectsTsxFromAppTrees &&
    scansTsx &&
    tsxNeedsItsExtension &&
    scansAppTreeWithoutSrc &&
    skipsEmptyPillar &&
    floorIsAboveZero &&
    realScanClearsFloor &&
    helpOk &&
    selfTestOk &&
    runOk &&
    unknownArgOk;

  if (!allOk) {
    console.error('self-test FAILED');
    console.error(`  detects the poster-cache shape:      ${detectsPoster}`);
    console.error(`  detects the sqlite ladder:           ${detectsLadder}`);
    console.error(`  detects join(process.cwd(), ...):    ${detectsCwdJoin}`);
    console.error(`  ignores an absolute default:         ${ignoresAbsolute}`);
    console.error(`  ignores URLs and plain words:        ${ignoresNonPaths}`);
    console.error(`  accepts the POPS-2735 fix:           ${posterFixed}`);
    console.error(`  accepts a shared-variable ladder:    ${ladderViaShared}`);
    console.error(`  catches mkdir without ENV:           ${catchesMkdirOnly}`);
    console.error(`  catches ENV without mkdir:           ${catchesEnvOnly}`);
    console.error(`  catches mkdir without chown:         ${catchesNoChown}`);
    console.error(`  classifies path literals:            ${literalsOk}`);
    console.error(`  folds line continuations:            ${foldingOk}`);
    console.error(`  reports an unparseable source:       ${catchesUnparseable}`);
    console.error(`  app rule sees an absolute default:   ${appRuleSeesAbsolute}`);
    console.error(`  ignores VITE_ client variables:      ${ignoresViteVars}`);
    console.error(`  counts resolvers it has seen:        ${countsResolversSeen}`);
    console.error(`  fails an empty Dockerfile:           ${catchesEmptyDockerfile}`);
    console.error(`  scans each resolver exactly once:    ${scansEachResolverOnce}`);
    console.error(`  sees env reads through a wrapper:    ${seesWrappedEnvReads}`);
    console.error(
      `  collects .tsx from app trees:        ${collectsTsxFromAppTrees} ` +
        `(${tsxCollected.length}, floor ${TSX_FLOOR})`
    );
    console.error(`  scans .tsx sources:                  ${scansTsx}`);
    console.error(`  parses TSX only with its extension:  ${tsxNeedsItsExtension}`);
    console.error(`  scans an app tree with no src/:      ${scansAppTreeWithoutSrc}`);
    console.error(`  skips a pillar with neither tree:    ${skipsEmptyPillar}`);
    console.error(`  discovery floor is above zero:       ${floorIsAboveZero}`);
    console.error(
      `  real scan clears the floor:          ${realScanClearsFloor} ` +
        `(${realScan.pillarsScanned} pillars, ${realScan.resolversSeen} resolvers)`
    );
    console.error(`  recognised --help:                   ${helpOk}`);
    console.error(`  recognised --self-test:              ${selfTestOk}`);
    console.error(`  recognised a bare run:               ${runOk}`);
    console.error(`  rejected an unknown argument:        ${unknownArgOk}`);
    return false;
  }
  console.log(
    'self-test OK — guard catches a relative default that is unnamed, uncreated, or ' +
      'left root-owned; clears absolute defaults and shared-variable ladders; and ' +
      'reports rather than falls silent on an unparseable source, an empty Dockerfile, ' +
      'or a scan that discovers nothing; and holds app trees to the stricter no-filesystem ' +
      'rule while ignoring VITE_ client config.'
  );
  return true;
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.kind === 'error') {
    console.error(`check-writable-path-defaults: ${parsed.message}\n`);
    console.error(USAGE);
    process.exit(2);
  }
  if (parsed.kind === 'help') {
    console.log(USAGE);
    process.exit(0);
  }
  if (parsed.kind === 'self-test') {
    process.exit(selfTest() ? 0 : 1);
  }

  const { violations, pillarsScanned, resolversSeen } = run();

  // Checked BEFORE the violation list: an empty list means "clean" only if the
  // scan actually saw the repo. Discovery loss otherwise reads as success.
  if (pillarsScanned < DISCOVERY_FLOOR.pillars || resolversSeen < DISCOVERY_FLOOR.resolvers) {
    console.error(
      'check-writable-path-defaults: discovery floor not met — this guard can no longer\n' +
        'see its subject, so a clean result would be meaningless.\n\n' +
        `  pillars with a src/ tree: ${pillarsScanned} (floor ${DISCOVERY_FLOOR.pillars})\n` +
        `  env-backed path resolvers: ${resolversSeen} (floor ${DISCOVERY_FLOOR.resolvers})\n\n` +
        '  Either pillars/ moved, a pillar source layout changed, or the AST walk\n' +
        '  stopped matching process.env reads. Fix the guard before trusting it.\n'
    );
    process.exit(1);
  }

  if (violations.length === 0) {
    console.log(
      'check-writable-path-defaults: OK — every env-backed relative default is guarded ' +
        `(${resolversSeen} resolvers across ${pillarsScanned} pillars).`
    );
    process.exit(0);
  }

  console.error(`check-writable-path-defaults: ${violations.length} violation(s).\n`);
  for (const violation of violations) {
    console.error(`  ${violation.file} — ${violation.where}`);
    if (violation.envVars.length > 0) {
      console.error(`    variables: ${violation.envVars.join(', ')}`);
    }
    if (violation.relativeDefaults.length > 0) {
      console.error(`    defaults:  ${violation.relativeDefaults.join(', ')}`);
    }
    console.error(`    ${violation.reason}`);
    console.error(
      violation.file.includes(`/app/`)
        ? `    fix: move this resolution into pillars/${violation.pillar}/src (the API tree),\n` +
            `         which ships in an image that can own the path. Browser code cannot\n` +
            `         read process.env, so a resolver here is dead or wrong.\n`
        : `    fix: in pillars/${violation.pillar}/Dockerfile, mkdir -p and chown the absolute\n` +
            `         path, then set it with ENV — the image must be correct with no compose.\n`
    );
  }
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
