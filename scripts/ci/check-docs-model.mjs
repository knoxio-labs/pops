#!/usr/bin/env node
/**
 * Documentation-model guard (ADR-041).
 *
 * Enforces three things, and deliberately nothing else:
 *
 *   1. Every top-level unit — `pillars/<id>` and `libs/<lib>` — has a
 *      `README.md`. These are published units whose README is the entry
 *      point a reader lands on, so one is always warranted.
 *
 *   2. The abolished doc trees do not come back. `prds/`, `themes/`,
 *      `epics/`, and `ideas/` directories anywhere in the repo are a
 *      violation: requirements-as-documents and status-as-documents were
 *      replaced by colocated READMEs plus Huly, and the failure mode this
 *      guards against is them reappearing one directory at a time.
 *
 *   3. Every repo path a markdown file points at actually exists. Docs
 *      accumulate hand-maintained indexes — repo trees, "key files" tables,
 *      pillar and lib listings — and they drift silently because nothing
 *      reads them. `libs/db-types` was named in three files and had never
 *      existed. A path that no longer resolves is a lie the reader cannot
 *      detect, so it fails the build instead.
 *
 * Check 1 is NOT a coverage quota. Per ADR-041 a README is warranted only
 * where the code cannot speak for itself, and a directory without one is a
 * correct outcome. Nothing requires a README for a module, a page directory,
 * or any nested path — a gate that did would produce exactly the
 * write-to-satisfy-the-gate documentation the model rejects.
 *
 * Usage:
 *   node scripts/ci/check-docs-model.mjs
 *   node scripts/ci/check-docs-model.mjs --self-test
 *
 * Exit 0 = clean. Exit 1 = a violation. Exit 2 = usage error.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/** Directory names that encode the abolished documentation model. */
export const BANNED_DOC_DIRS = ['prds', 'themes', 'epics', 'ideas'];

/** Repo-root directories a backticked token must start with to be treated as a path claim. */
export const PATH_ROOTS = ['pillars/', 'libs/', 'docs/', 'infra/', 'scripts/', '.github/'];

/** A backticked token naming a source file, so a directory-relative path is still checked. */
export const SOURCE_FILE_RE = /\/[\w.-]+\.(?:tsx?|mjs|cjs|jsx?|json|css|md|ya?ml|rs|toml)$/u;

/** Directories never walked. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'target', 'coverage', '.next']);

/**
 * Discover the repo's top-level units: every immediate child of `pillars/`
 * and `libs/`. A unit is a directory — `moltbot` ships no package.json and
 * still counts, because a reader still lands on it.
 *
 * @param {string} root
 * @returns {string[]} Sorted repo-relative unit dirs.
 */
export function discoverUnits(root) {
  /** @type {string[]} */
  const out = [];
  for (const base of ['pillars', 'libs']) {
    const baseDir = join(root, base);
    if (!existsSync(baseDir)) continue;
    for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      out.push(relative(root, join(baseDir, entry.name)));
    }
  }
  return out.toSorted((a, b) => a.localeCompare(b));
}

/**
 * Walk the tree collecting directories, invoking `onDir` for each. Skips
 * build output, VCS metadata and dotfiles.
 *
 * @param {string} dir
 * @param {(full: string, name: string) => boolean} onDir Return false to stop descending.
 */
function walkDirs(dir, onDir) {
  /** @type {import('node:fs').Dirent[]} */
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (onDir(full, entry.name)) walkDirs(full, onDir);
  }
}

/**
 * Find directories whose name is in `banned`. Does not descend into one once
 * found — one report per tree, not one per nested copy.
 *
 * @param {string} root
 * @param {string[]} [banned]
 * @returns {string[]} Sorted repo-relative banned dirs.
 */
export function findBannedDocDirs(root, banned = BANNED_DOC_DIRS) {
  /** @type {string[]} */
  const found = [];
  walkDirs(root, (full, name) => {
    if (!banned.includes(name)) return true;
    found.push(relative(root, full));
    return false;
  });
  return found.toSorted((a, b) => a.localeCompare(b));
}

/**
 * Collect every markdown file under `root`, plus the repo-root ones the
 * directory walk does not reach.
 *
 * @param {string} root
 * @returns {string[]} Sorted repo-relative .md paths.
 */
export function findMarkdownFiles(root) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} dir */
  const collect = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        out.push(relative(root, join(dir, entry.name)));
      }
    }
  };
  collect(root);
  walkDirs(root, (full) => {
    collect(full);
    return true;
  });
  return out.toSorted((a, b) => a.localeCompare(b));
}

/**
 * True when a token is a template rather than a real path — `pillars/<id>/…`,
 * `adr-NNN-slug.md`, a glob, or a shell/JS interpolation. These are
 * deliberately unresolvable and must not be reported.
 *
 * @param {string} token
 * @returns {boolean}
 */
export function isPlaceholderPath(token) {
  return (
    /[<>*{}$]/u.test(token) ||
    token.includes('NNN') ||
    token.includes('...') ||
    token.startsWith('/') || // absolute host path in a shell snippet
    token.startsWith('~') // home-relative path in a shell snippet
  );
}

/**
 * ADRs are historical records: an ADR describes the tree as it stood when the
 * decision was made, and its numbering is frozen and append-only. Forcing its
 * paths to keep resolving would mean rewriting the record every time code
 * moves, so they are exempt from the path check.
 *
 * @param {string} mdPath
 * @returns {boolean}
 */
export function isHistoricalRecord(mdPath) {
  return /(^|\/)docs\/architecture\/adr-/u.test(mdPath) || /(^|\/)adr-\d+/u.test(mdPath);
}

/**
 * Extract the repo paths a markdown source claims exist:
 *   - relative markdown link targets, resolved against the file's own dir
 *   - backticked tokens starting with a known repo root, resolved against the repo root
 *
 * Anchors, query strings and external URLs are ignored.
 *
 * A backticked token is ambiguous: `scripts/foo.ts` inside
 * `pillars/shell/README.md` may mean the repo-root `scripts/` or that
 * pillar's own. Both are offered as candidates and the claim holds if
 * either resolves.
 *
 * @param {string} source
 * @param {string} mdPath Repo-relative path of the markdown file.
 * @returns {{ raw: string, candidates: string[] }[]}
 */
export function extractPathClaims(source, mdPath) {
  const fromDir = dirname(mdPath);
  /** @type {{ raw: string, candidates: string[] }[]} */
  const claims = [];

  for (const match of source.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/gu)) {
    const target = match[1];
    if (/^(?:https?:|mailto:|#)/u.test(target)) continue;
    const clean = target.split('#')[0].split('?')[0];
    if (clean === '' || isPlaceholderPath(clean)) continue;
    claims.push({ raw: target, candidates: [join(fromDir, clean)] });
  }

  for (const match of source.matchAll(/`([^`\n]+)`/gu)) {
    const token = match[1].trim().replace(/[.,;:]$/u, '');
    if (isPlaceholderPath(token) || /\s/u.test(token) || !token.includes('/')) continue;

    // Either an explicit repo-root path, or a directory-relative one naming a
    // real source file — `components/PhotoGallery.tsx` in a page README means
    // that page's own `components/`, and used to slip through unchecked.
    const rooted = PATH_ROOTS.some((rootDir) => token.startsWith(rootDir));
    const looksLikeSourceFile = SOURCE_FILE_RE.test(token);
    if (!rooted && !looksLikeSourceFile) continue;
    if (token.startsWith('@')) continue; // npm scope, not a path

    claims.push({ raw: token, candidates: [token, join(fromDir, token)] });
  }

  return claims;
}

/**
 * Drop paths git deliberately ignores — `.env`, `infra/secrets/`, build
 * output. A doc may legitimately name a file that is never committed, and
 * failing the build over one would be a false positive nobody could fix.
 *
 * @param {string} root
 * @param {string[]} paths
 * @returns {Set<string>} The subset that is gitignored.
 */
export function gitIgnoredSubset(root, paths) {
  // A single path outside the repo makes `git check-ignore` fatal on the whole
  // batch, which would silently disable the filter for every other path.
  const inRepo = paths.filter((p) => p !== '' && !p.startsWith('..') && !p.startsWith('/'));
  if (inRepo.length === 0) return new Set();
  try {
    const out = execFileSync('git', ['check-ignore', '--no-index', '--stdin'], {
      cwd: root,
      input: inRepo.join('\n'),
      encoding: 'utf8',
    });
    return new Set(out.split('\n').filter(Boolean));
  } catch (error) {
    // git exits 1 when nothing matched; anything on stdout is still valid.
    const stdout = error && typeof error === 'object' && 'stdout' in error ? error.stdout : '';
    return new Set(
      String(stdout ?? '')
        .split('\n')
        .filter(Boolean)
    );
  }
}

/**
 * Every tracked file and directory path in the repo, repo-relative. Used to
 * resolve abbreviated cross-unit references by suffix.
 *
 * @param {string} root
 * @returns {string[]}
 */
export function allRepoPaths(root) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} dir */
  const collect = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(relative(root, join(dir, entry.name)));
      // walkDirs skips dotted dirs, but `.storybook/` and friends are real
      // targets a doc may name, so descend one level into them here.
      if (entry.isDirectory() && entry.name.startsWith('.') && entry.name !== '.git') {
        try {
          for (const sub of readdirSync(join(dir, entry.name), { withFileTypes: true })) {
            out.push(relative(root, join(dir, entry.name, sub.name)));
          }
        } catch {
          /* unreadable dot dir — nothing to index */
        }
      }
    }
  };
  collect(root);
  walkDirs(root, (full) => {
    collect(full);
    return true;
  });
  return out;
}

/**
 * @typedef {{ file: string, claim: string }} BrokenPath
 */

/**
 * Every path claim across every markdown file that does not resolve on disk.
 *
 * @param {string} root
 * @returns {BrokenPath[]}
 */
export function findBrokenDocPaths(root) {
  const allPaths = allRepoPaths(root);
  /** @type {(BrokenPath & { candidates: string[] })[]} */
  const misses = [];
  for (const mdPath of findMarkdownFiles(root)) {
    if (isHistoricalRecord(mdPath)) continue;
    const source = readFileSync(join(root, mdPath), 'utf8');
    for (const { raw, candidates } of extractPathClaims(source, mdPath)) {
      const targets = candidates.map((c) => c.replace(/\/$/u, '')).filter((c) => c !== '');
      if (targets.length === 0) continue;
      if (targets.some((t) => existsSync(join(root, t)))) continue;
      // Prose abbreviates cross-unit references — `worker/ai/client.ts` for
      // `pillars/food/src/worker/ai/client.ts`. Accept when some real file
      // ends with the token; only a path matching nothing at all is a lie.
      if (allPaths.some((p) => p.endsWith('/' + targets[0]))) continue;
      misses.push({ file: mdPath, claim: raw, candidates: targets });
    }
  }

  const ignored = gitIgnoredSubset(root, [...new Set(misses.flatMap((m) => m.candidates))]);
  return misses
    .filter((m) => !m.candidates.some((c) => ignored.has(c)))
    .map(({ file, claim }) => ({ file, claim }));
}

/**
 * @typedef {{ missingReadme: string[], bannedDirs: string[], brokenPaths: BrokenPath[] }} DocsModelReport
 */

/**
 * @param {string} root
 * @returns {DocsModelReport}
 */
export function checkDocsModel(root) {
  const missingReadme = discoverUnits(root).filter(
    (unit) => !existsSync(join(root, unit, 'README.md'))
  );
  return {
    missingReadme,
    bannedDirs: findBannedDocDirs(root),
    brokenPaths: findBrokenDocPaths(root),
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/ci/check-docs-model.mjs [--self-test]\n' +
        'Fails if a pillar/lib lacks a README.md, an abolished doc tree ' +
        '(prds/, themes/, epics/, ideas/) has reappeared, or a markdown file ' +
        'points at a repo path that does not exist. See ADR-041.'
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const { missingReadme, bannedDirs, brokenPaths } = checkDocsModel(repoRoot);

  if (missingReadme.length === 0 && bannedDirs.length === 0 && brokenPaths.length === 0) {
    console.log('OK — units documented, no abolished doc tree, every doc path resolves.');
    process.exit(0);
  }

  for (const unit of missingReadme) {
    console.error(
      `FAIL — ${unit} has no README.md. A published unit's README is the entry ` +
        'point a reader lands on; write one describing what it is and what depends on it.'
    );
  }
  for (const dir of bannedDirs) {
    console.error(
      `FAIL — ${dir} recreates an abolished doc tree. Requirements and status do not ` +
        'live in this repo (ADR-041): put how-it-works in a colocated README, decisions ' +
        'in an ADR, and undone work in Huly (project POPS).'
    );
  }
  for (const { file, claim } of brokenPaths) {
    console.error(`FAIL — ${file} points at "${claim}", which does not exist.`);
  }
  process.exit(1);
}

/** @returns {boolean} */
function selfTest() {
  const units = discoverUnits(repoRoot);
  const ok1 = units.includes('libs/ui') && units.includes('pillars/finance');

  const banned = findBannedDocDirs(repoRoot, ['__tests__']);
  const ok2 =
    banned.length > 0 &&
    banned.every((d) => d.endsWith('__tests__')) &&
    new Set(banned).size === banned.length;

  const claims = extractPathClaims(
    'see [x](../libs/ui/README.md) and `pillars/finance/src` and `pillars/<id>/docs` ' +
      'and `docs/architecture/adr-NNN-slug.md` and [ext](https://example.com) and [a](#anchor)',
    'docs/thing.md'
  );
  const rawClaims = claims.map((c) => c.raw);
  const ok3 =
    rawClaims.includes('../libs/ui/README.md') &&
    rawClaims.includes('pillars/finance/src') &&
    !rawClaims.some((c) => c.includes('<id>')) &&
    !rawClaims.some((c) => c.includes('NNN')) &&
    !rawClaims.some((c) => c.startsWith('http')) &&
    !rawClaims.some((c) => c.startsWith('#'));

  const resolvedLink = claims.find((c) => c.raw === '../libs/ui/README.md');
  const ok4 = resolvedLink !== undefined && resolvedLink.candidates.includes('libs/ui/README.md');

  // A backticked token offers both a repo-root and a file-relative candidate,
  // so `scripts/x.ts` inside pillars/shell/ can mean that pillar's own scripts/.
  const ambiguous = extractPathClaims('`scripts/x.ts`', 'pillars/shell/README.md').at(0);
  const ok5 =
    ambiguous !== undefined &&
    ambiguous.candidates.includes('scripts/x.ts') &&
    ambiguous.candidates.includes('pillars/shell/scripts/x.ts');

  // Gitignored paths must be filtered out rather than reported.
  const ok6 = gitIgnoredSubset(repoRoot, ['node_modules']).has('node_modules');

  // A directory-relative source path is checked against the file's own dir.
  const rel = extractPathClaims(
    'see `components/Foo.tsx`',
    'pillars/x/app/src/pages/p/README.md'
  ).at(0);
  const ok7 =
    rel !== undefined && rel.candidates.includes('pillars/x/app/src/pages/p/components/Foo.tsx');

  // An npm specifier is not a path claim.
  const ok8 = extractPathClaims('`@pops/pillar-sdk/server`', 'docs/x.md').length === 0;

  if (!ok1) console.error('self-test FAILED: unit discovery missed a known unit');
  if (!ok2) console.error('self-test FAILED: banned-dir walk misbehaved');
  if (!ok3) console.error('self-test FAILED: path-claim extraction wrong');
  if (!ok4) console.error('self-test FAILED: relative link not resolved against its own dir');
  if (!ok5) console.error('self-test FAILED: backticked token lacks both candidates');
  if (!ok6) console.error('self-test FAILED: gitignore filter did not detect an ignored path');
  if (!ok7) console.error('self-test FAILED: directory-relative source path not resolved');
  if (!ok8) console.error('self-test FAILED: npm specifier treated as a path claim');
  return ok1 && ok2 && ok3 && ok4 && ok5 && ok6 && ok7 && ok8;
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '')) {
  main();
}
