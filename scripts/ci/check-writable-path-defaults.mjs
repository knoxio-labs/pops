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
 *   - `pillars/<id>/app/**`. Those trees are browser bundles served by the
 *     shell image; they have no Dockerfile of their own, so there is no image
 *     for this guard to hold responsible. Only `pillars/<id>/src/**`, the
 *     tree each pillar Dockerfile copies in as `dist`, is scanned.
 *   - Paths not reached through an environment variable whose name ends in
 *     `_DIR`, `_PATH`, or `_ROOT`. A hard-coded relative path with no
 *     override is invisible here.
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
    if (envName !== null && PATH_ENV_SUFFIX.test(envName)) envVars.add(envName);

    if (ts.isStringLiteral(node)) noteLiteral(node.text);

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
 * @returns {{ where: string, envVars: string[], relativeDefaults: string[] }[]}
 */
export function findRelativeDefaults(fileName, source) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.ESNext, true);
  const constants = collectStringConstants(sourceFile);
  /** @type {{ where: string, envVars: string[], relativeDefaults: string[] }[]} */
  const findings = [];

  /** @param {ts.Node} scope @param {string} label */
  const consider = (scope, label) => {
    const { envVars, relativeDefaults } = scanScope(scope, constants);
    if (envVars.length === 0 || relativeDefaults.length === 0) return;
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
      const line = sourceFile.getLineAndCharacterOfPosition(statement.getStart()).line + 1;
      consider(statement, `module-level statement at line ${line}`);
    }
    visit(statement);
  }
  return findings;
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
function listRuntimeSources(dir) {
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
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.d.ts')) continue;
    if (/\.(test|spec)\.ts$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

/**
 * Run the guard over the repository.
 *
 * @returns {{ pillar: string, file: string, where: string, envVars: string[], relativeDefaults: string[], reason: string }[]}
 */
export function run() {
  /** @type {{ pillar: string, file: string, where: string, envVars: string[], relativeDefaults: string[], reason: string }[]} */
  const violations = [];
  const pillars = readdirSync(PILLARS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();

  for (const pillar of pillars) {
    const sources = listRuntimeSources(join(PILLARS_DIR, pillar, 'src'));
    if (sources.length === 0) continue;
    const dockerfilePath = join(PILLARS_DIR, pillar, 'Dockerfile');
    const dockerfile = existsSync(dockerfilePath)
      ? parseDockerfile(readFileSync(dockerfilePath, 'utf8'))
      : null;

    for (const source of sources) {
      const relative = source.slice(repoRoot.length + 1);
      for (const finding of findRelativeDefaults(relative, readFileSync(source, 'utf8'))) {
        if (dockerfile === null) {
          violations.push({
            pillar,
            file: relative,
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
            file: relative,
            where: finding.where,
            envVars: finding.envVars,
            relativeDefaults: finding.relativeDefaults,
            reason: verdict.reason,
          });
        }
      }
    }
  }
  return violations;
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

  const poster = findRelativeDefaults('poster.ts', FIXTURE_POSTER_CACHE);
  const ladder = findRelativeDefaults('ladder.ts', FIXTURE_LADDER);
  const cwdJoin = findRelativeDefaults('engrams.ts', FIXTURE_CWD_JOIN);
  const absolute = findRelativeDefaults('ingest.ts', FIXTURE_ABSOLUTE);
  const nonPaths = findRelativeDefaults('url.ts', FIXTURE_NON_PATHS);

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
    console.error(`  recognised --help:                   ${helpOk}`);
    console.error(`  recognised --self-test:              ${selfTestOk}`);
    console.error(`  recognised a bare run:               ${runOk}`);
    console.error(`  rejected an unknown argument:        ${unknownArgOk}`);
    return false;
  }
  console.log(
    'self-test OK — guard catches a relative default that is unnamed, uncreated, or ' +
      'left root-owned, and clears absolute defaults and shared-variable ladders.'
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

  const violations = run();
  if (violations.length === 0) {
    console.log('check-writable-path-defaults: OK — every env-backed relative default is guarded.');
    process.exit(0);
  }

  console.error(
    `check-writable-path-defaults: ${violations.length} unguarded relative path default(s).\n`
  );
  for (const violation of violations) {
    console.error(`  ${violation.file} — ${violation.where}`);
    console.error(`    variables: ${violation.envVars.join(', ')}`);
    console.error(`    defaults:  ${violation.relativeDefaults.join(', ')}`);
    console.error(`    ${violation.reason}`);
    console.error(
      `    fix: in pillars/${violation.pillar}/Dockerfile, mkdir -p and chown the absolute\n` +
        `         path, then set it with ENV — the image must be correct with no compose.\n`
    );
  }
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
