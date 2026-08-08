#!/usr/bin/env node
/**
 * Documentation-model guard (ADR-041).
 *
 * Enforces the following, and deliberately nothing else:
 *
 *   1. Every top-level unit — `pillars/<id>`, `libs/<lib>` and
 *      `clients/<client>` — has a `README.md`. These are published units
 *      whose README is the entry point a reader lands on, so one is always
 *      warranted.
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
 *   4. The same, for the doc paths a **comment** points at — in TypeScript,
 *      Rust, Swift, workflow YAML, shell and TOML. Check 3 only ever saw
 *      markdown, so when the doc trees were deleted the pointers living in
 *      source survived with nothing red to show for it, several of them on
 *      repo-wide CI guards where the dead link was the only surviving
 *      explanation of why the guard exists. A comment is where the WHY
 *      lives (ADR-041), which makes a dangling pointer there the most
 *      expensive kind.
 *
 *   5. A README that states an absence names the Huly issue tracking it.
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
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/** Directory names that encode the abolished documentation model. */
export const BANNED_DOC_DIRS = ['prds', 'themes', 'epics', 'ideas'];

/** Repo-root directories a backticked token must start with to be treated as a path claim. */
export const PATH_ROOTS = [
  'pillars/',
  'libs/',
  'clients/',
  'docs/',
  'infra/',
  'scripts/',
  '.github/',
];

/** A backticked token naming a source file, so a directory-relative path is still checked. */
export const SOURCE_FILE_RE = /\/[\w.-]+\.(?:tsx?|mjs|cjs|jsx?|json|css|md|ya?ml|rs|swift|toml)$/u;

/** Directories never walked. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'target', 'coverage', '.next']);

/**
 * Discover the repo's top-level units: every immediate child of `pillars/`,
 * `libs/` and `clients/` (ADR-043). A unit is a directory — `moltbot` ships no
 * package.json and `clients/ios` is a Swift tree the workspace cannot see, and
 * both still count, because a reader still lands on them.
 *
 * @param {string} root
 * @returns {string[]} Sorted repo-relative unit dirs.
 */
export function discoverUnits(root) {
  /** @type {string[]} */
  const out = [];
  for (const base of ['pillars', 'libs', 'clients']) {
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
 * @typedef {{ file: string, raw: string, candidates: string[] }} PathClaim
 */

/**
 * Resolve a batch of path claims and return the ones that name nothing.
 *
 * Deliberately extractor-agnostic: markdown links, backticked prose tokens and
 * comment pointers all arrive here as the same `{ file, raw, candidates }`
 * shape. Existence, abbreviated-suffix tolerance and the gitignore filter are
 * one implementation so the rules cannot drift between file types.
 *
 * @param {string} root
 * @param {PathClaim[]} claims
 * @returns {BrokenPath[]}
 */
export function resolvePathClaims(root, claims) {
  const allPaths = allRepoPaths(root);
  const resolvedRoot = resolve(root);
  // `join(root, t)` alone would follow a `../../../etc/hostname`-style claim
  // straight out of the repo and report it "resolved" whenever that host path
  // happens to exist — a claim is only real if it also stays inside root.
  const existsWithinRoot = (t) => {
    const resolved = resolve(root, t);
    return (
      (resolved === resolvedRoot || resolved.startsWith(resolvedRoot + sep)) && existsSync(resolved)
    );
  };
  /** @type {(BrokenPath & { candidates: string[] })[]} */
  const misses = [];
  for (const { file, raw, candidates } of claims) {
    const targets = candidates.map((c) => c.replace(/\/$/u, '')).filter((c) => c !== '');
    if (targets.length === 0) continue;
    if (targets.some(existsWithinRoot)) continue;
    // Prose abbreviates cross-unit references — `worker/ai/client.ts` for
    // `pillars/food/src/worker/ai/client.ts`. Accept when some real file
    // ends with the token; only a path matching nothing at all is a lie.
    if (allPaths.some((p) => p.endsWith('/' + targets[0]))) continue;
    misses.push({ file, claim: raw, candidates: targets });
  }

  const ignored = gitIgnoredSubset(root, [...new Set(misses.flatMap((m) => m.candidates))]);
  return misses
    .filter((m) => !m.candidates.some((c) => ignored.has(c)))
    .map(({ file, claim }) => ({ file, claim }));
}

/**
 * Every path claim across every markdown file that does not resolve on disk.
 *
 * @param {string} root
 * @returns {BrokenPath[]}
 */
export function findBrokenDocPaths(root) {
  /** @type {PathClaim[]} */
  const claims = [];
  for (const mdPath of findMarkdownFiles(root)) {
    if (isHistoricalRecord(mdPath)) continue;
    const source = readFileSync(join(root, mdPath), 'utf8');
    for (const claim of extractPathClaims(source, mdPath)) {
      claims.push({ file: mdPath, ...claim });
    }
  }
  return resolvePathClaims(root, claims);
}

/** Extensions with C-style comments — line comments and slash-star blocks. */
export const SLASH_COMMENT_EXTS = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'rs', 'swift']);

/** Extensions whose comments start with `#`. */
export const HASH_COMMENT_EXTS = new Set(['yml', 'yaml', 'sh', 'bash', 'toml']);

/**
 * Dot-directories the source walk descends into. Everything under a dot is
 * skipped by default, but the workflow files are exactly where the CI-guard
 * rationale lives, so `.github` is not optional.
 */
const SCANNED_DOT_DIRS = new Set(['.github']);

/**
 * Every source, workflow and shell file whose comments are scanned. Markdown
 * is excluded — {@link findBrokenDocPaths} already covers it, with richer
 * rules (links, backticked prose) that do not apply to code.
 *
 * @param {string} root
 * @returns {string[]} Sorted repo-relative paths.
 */
export function findSourceFiles(root) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} dir */
  const collect = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const ext = (/\.([\w]+)$/u.exec(entry.name) ?? ['', ''])[1].toLowerCase();
      if (!SLASH_COMMENT_EXTS.has(ext) && !HASH_COMMENT_EXTS.has(ext)) continue;
      out.push(relative(root, join(dir, entry.name)));
    }
  };
  /** @param {string} dir */
  const descend = (dir) => {
    /** @type {import('node:fs').Dirent[]} */
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith('.') && !SCANNED_DOT_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      collect(full);
      descend(full);
    }
  };
  collect(root);
  descend(root);
  return out.toSorted((a, b) => a.localeCompare(b));
}

/**
 * The comment text of a source file, as one string per contiguous run of
 * comment lines.
 *
 * Runs are joined rather than reported per line because a long path wraps: a
 * hyphenated ADR filename can break mid-token across two comment lines, and
 * checking the halves separately would report a false break. A line ending in
 * `-` or `/` is treated as a mid-token wrap and joined with no separator;
 * anything else joins with a space.
 *
 * Only comments are read. A doc path appearing in code is usually a runtime
 * value or a test fixture — including the deliberately unresolvable fixture
 * paths this file's own self-test feeds to {@link extractPathClaims}, which
 * are correct exactly as they are.
 *
 * @param {string} source
 * @param {string} ext Lowercase extension without the dot.
 * @returns {string[]}
 */
export function extractComments(source, ext) {
  const slash = SLASH_COMMENT_EXTS.has(ext);
  if (!slash && !HASH_COMMENT_EXTS.has(ext)) return [];

  /** @type {string[]} */
  const runs = [];
  /** @type {string[]} */
  let run = [];
  let inBlock = false;

  const flush = () => {
    if (run.length === 0) return;
    let text = '';
    for (const piece of run) {
      const part = piece.trim();
      if (part === '') continue;
      if (text === '') text = part;
      else text += /[-/]$/u.test(text) ? part : ' ' + part;
    }
    if (text !== '') runs.push(text);
    run = [];
  };

  for (const line of source.split('\n')) {
    if (inBlock) {
      const end = line.indexOf('*/');
      run.push((end === -1 ? line : line.slice(0, end)).replace(/^\s*\*+/u, ''));
      if (end !== -1) {
        inBlock = false;
        flush();
      }
      continue;
    }
    const start = findCommentStart(line, slash);
    if (start === null) {
      flush();
      continue;
    }
    if (start.block) {
      const end = line.indexOf('*/', start.index + 2);
      if (end === -1) {
        inBlock = true;
        run.push(line.slice(start.index + 2));
      } else {
        run.push(line.slice(start.index + 2, end));
        flush();
      }
      continue;
    }
    run.push(line.slice(start.index + start.marker.length));
  }
  flush();
  return runs;
}

/**
 * Where a line's comment begins, skipping markers that sit inside a string
 * literal — `'https://…'` and `sed 's/#//'` are code, not comments.
 *
 * A `#` counts only at line start or after whitespace, which is the rule shell,
 * YAML and TOML actually use. Without it, shell parameter expansion
 * (`${LAST_TAG#v}`) reads as a comment and everything after it is scanned as
 * prose. A backtick is always a string delimiter, including in `#`-comment
 * languages: in shell it opens command substitution, and a `#` inside one
 * (`` `echo x #not-a-comment` ``) is code, not the line's real comment start.
 * YAML and TOML give a backtick no special meaning, but treating it as a
 * delimiter there too costs nothing — it only ever pairs up around inline
 * code the same way it does in prose.
 *
 * @param {string} line
 * @param {boolean} slash True for `//` + block comments, false for `#`.
 * @returns {{ index: number, marker: string, block: boolean } | null}
 */
function findCommentStart(line, slash) {
  /** @type {string | null} */
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote !== null) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (!slash && ch === '#' && (i === 0 || /\s/u.test(line[i - 1]))) {
      return { index: i, marker: '#', block: false };
    }
    if (slash && ch === '/' && line[i + 1] === '/') return { index: i, marker: '//', block: false };
    if (slash && ch === '/' && line[i + 1] === '*') return { index: i, marker: '/*', block: true };
  }
  return null;
}

/**
 * A path-like token naming something under a `docs/` tree, with the delimiter
 * that must precede it so a URL's `…/docs/…` tail is not mistaken for a repo
 * path.
 */
export const DOC_PATH_TOKEN_RE = /(?:^|[\s`'"([<])((?:[\w.-]+\/)*docs\/[\w./-]*[\w])/gu;

/**
 * The doc paths a source file's comments claim exist.
 *
 * Two shapes count, and the line is drawn where a token stops being prose and
 * starts being a pointer the reader is meant to follow:
 *
 *   - a markdown file under any `docs/` tree, root-level or a pillar's own;
 *   - a directory two or more levels inside the repo-root `docs/` tree, so a
 *     whole deleted sub-tree is caught even when no file is named. One level
 *     is not enough: a comment writing "docs/code-only PRs" is using the
 *     slash as an "or", not naming `docs/code-only`.
 *
 * @param {string} source
 * @param {string} filePath Repo-relative path of the source file.
 * @returns {PathClaim[]}
 */
export function extractSourceDocClaims(source, filePath) {
  const ext = (/\.([\w]+)$/u.exec(filePath) ?? ['', ''])[1].toLowerCase();
  const fromDir = dirname(filePath);
  /** @type {PathClaim[]} */
  const claims = [];
  for (const comment of extractComments(source, ext)) {
    for (const match of comment.matchAll(DOC_PATH_TOKEN_RE)) {
      const token = match[1];
      if (token.includes('://') || isPlaceholderPath(token)) continue;
      const namesAFile = token.endsWith('.md');
      const deepRootDocsDir = token.startsWith('docs/') && token.split('/').length > 2;
      if (!namesAFile && !deepRootDocsDir) continue;
      claims.push({ file: filePath, raw: token, candidates: [token, join(fromDir, token)] });
    }
  }
  return claims;
}

/**
 * Every doc path claimed by a comment, anywhere in the tree, that resolves to
 * nothing.
 *
 * @param {string} root
 * @returns {BrokenPath[]}
 */
export function findBrokenSourceDocPaths(root) {
  /** @type {PathClaim[]} */
  const claims = [];
  for (const filePath of findSourceFiles(root)) {
    claims.push(...extractSourceDocClaims(readFileSync(join(root, filePath), 'utf8'), filePath));
  }
  return resolvePathClaims(root, claims);
}

/** Heading that introduces a section describing work that is not done. */
export const ABSENCE_HEADING_RE =
  /^#+[ \t]*(absent|not built|unbuilt|missing|gaps?|known gaps|limitations)\b/i;

/** A Huly issue key. */
export const HULY_KEY_RE = /\bPOPS-\d+\b/;

/**
 * A README may say something is missing — silence about a real gap misleads.
 * But an unbuilt thing is *work*, and work lives in Huly, so the section has to
 * name its issue. Without this an absence becomes a second backlog nobody
 * reads, which is the failure the whole model exists to end. An absence that is
 * permanent by design should be written as scope ("TV is out of scope here"),
 * not as a pending gap.
 *
 * @param {string} root
 * @returns {{ file: string, heading: string }[]}
 */
export function findUntrackedAbsences(root) {
  /** @type {{ file: string, heading: string }[]} */
  const out = [];
  for (const mdPath of findMarkdownFiles(root)) {
    if (!mdPath.endsWith('README.md')) continue;
    const lines = readFileSync(join(root, mdPath), 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!ABSENCE_HEADING_RE.test(lines[i])) continue;
      const depth = (/^#+/u.exec(lines[i]) ?? [''])[0].length;
      /** @type {string[]} */
      const body = [];
      for (let j = i + 1; j < lines.length; j++) {
        const next = /^#+/u.exec(lines[j]);
        if (next && next[0].length <= depth) break;
        body.push(lines[j]);
      }
      if (!HULY_KEY_RE.test(body.join('\n'))) {
        out.push({ file: mdPath, heading: lines[i].trim() });
      }
    }
  }
  return out;
}

/**
 * @typedef {{
 *   missingReadme: string[],
 *   bannedDirs: string[],
 *   brokenPaths: BrokenPath[],
 *   brokenSourcePaths: BrokenPath[],
 *   untrackedAbsences: { file: string, heading: string }[],
 * }} DocsModelReport
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
    brokenSourcePaths: findBrokenSourceDocPaths(root),
    untrackedAbsences: findUntrackedAbsences(root),
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/ci/check-docs-model.mjs [--self-test]\n' +
        'Fails if a pillar/lib/client lacks a README.md, an abolished doc tree ' +
        '(prds/, themes/, epics/, ideas/) has reappeared, or a markdown file or ' +
        'source comment points at a doc path that does not exist. See ADR-041.'
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const { missingReadme, bannedDirs, brokenPaths, brokenSourcePaths, untrackedAbsences } =
    checkDocsModel(repoRoot);

  if (
    missingReadme.length === 0 &&
    bannedDirs.length === 0 &&
    brokenPaths.length === 0 &&
    brokenSourcePaths.length === 0 &&
    untrackedAbsences.length === 0
  ) {
    console.log(
      'OK — units documented, no abolished doc tree, every doc path resolves, every absence tracked.'
    );
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
  for (const { file, claim } of brokenSourcePaths) {
    console.error(
      `FAIL — a comment in ${file} points at "${claim}", which does not exist. ` +
        'Replace it with the ADR that superseded it, an in-tree path that demonstrates ' +
        'the thing, or the reason written out (ADR-041) — never a ticket or PR id.'
    );
  }
  for (const { file, heading } of untrackedAbsences) {
    console.error(
      `FAIL — ${file} has an untracked absence under "${heading}". An unbuilt thing is work: ` +
        'file a Huly issue and name its key inline (e.g. "…is not built (POPS-42)."), or rewrite ' +
        'it as deliberate scope rather than a pending gap.'
    );
  }
  process.exit(1);
}

/** @returns {boolean} */
function selfTest() {
  const units = discoverUnits(repoRoot);
  const ok1 =
    units.includes('libs/ui') && units.includes('pillars/finance') && units.includes('clients/ios');

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

  // Gitignored paths must be filtered out rather than reported. Probe with a
  // FILE pattern (`.env`): `git check-ignore` cannot classify a path that is
  // absent from disk, so a directory-only pattern like `node_modules/` matches
  // locally and not on a CI checkout that never installed.
  const ignored = gitIgnoredSubset(repoRoot, ['pillars/mcp/.env', 'pillars/mcp/README.md']);
  const ok6 = ignored.has('pillars/mcp/.env') && !ignored.has('pillars/mcp/README.md');

  // A directory-relative source path is checked against the file's own dir.
  const rel = extractPathClaims(
    'see `components/Foo.tsx`',
    'pillars/x/app/src/pages/p/README.md'
  ).at(0);
  const ok7 =
    rel !== undefined && rel.candidates.includes('pillars/x/app/src/pages/p/components/Foo.tsx');

  // An npm specifier is not a path claim.
  const ok8 = extractPathClaims('`@pops/pillar-sdk/server`', 'docs/x.md').length === 0;

  // An absence section must name its Huly issue.
  const ok9 =
    ABSENCE_HEADING_RE.test('## Absent') &&
    ABSENCE_HEADING_RE.test('### Known gaps') &&
    !ABSENCE_HEADING_RE.test('## Where things live') &&
    HULY_KEY_RE.test('no per-bank parsing (POPS-29).') &&
    !HULY_KEY_RE.test('no per-bank parsing.');

  // Every unit root resolves a bare directory token. None of these three names
  // a source file, so each is a claim only because its root is in PATH_ROOTS —
  // dropping one would make paths under it invisible rather than reported.
  const rootedTokens = extractPathClaims(
    'see `pillars/finance/src` and `libs/ui/src` and `clients/ios/Packages`',
    'docs/thing.md'
  ).map((c) => c.raw);
  const ok10 =
    rootedTokens.includes('pillars/finance/src') &&
    rootedTokens.includes('libs/ui/src') &&
    rootedTokens.includes('clients/ios/Packages');

  // A backticked Swift path with a slash is extracted as a claim — `.swift`
  // was missing from SOURCE_FILE_RE, so an iOS README could name a source
  // file (e.g. `Tests/AuthTests/Foo.swift`) that this guard never checked.
  const swiftClaim = extractPathClaims(
    'see `Sources/Foo/Bar.swift`',
    'clients/ios/Packages/Foo/README.md'
  ).at(0);
  const ok11 = swiftClaim !== undefined && swiftClaim.raw === 'Sources/Foo/Bar.swift';

  // End-to-end: against a real tree, a Swift path that exists resolves and
  // one that doesn't is reported as broken — a dangling Swift path used to
  // pass silently because SOURCE_FILE_RE never matched `.swift`.
  const swiftFixtureRoot = mkdtempSync(join(tmpdir(), 'docs-model-swift-'));
  let ok12 = false;
  try {
    // `git init` so gitIgnoredSubset's `check-ignore` call below hits a real
    // (empty) repo rather than its no-repo fallback path.
    execFileSync('git', ['init', '-q'], { cwd: swiftFixtureRoot });
    const pkgDir = join(swiftFixtureRoot, 'clients', 'ios', 'Packages', 'Foo');
    mkdirSync(join(pkgDir, 'Sources', 'Foo'), { recursive: true });
    writeFileSync(join(pkgDir, 'Sources', 'Foo', 'Bar.swift'), '// fixture\n');
    writeFileSync(
      join(pkgDir, 'README.md'),
      'Real: `Sources/Foo/Bar.swift`. Dangling: `Sources/Foo/Ghost.swift`.\n'
    );
    const broken = findBrokenDocPaths(swiftFixtureRoot);
    ok12 =
      broken.some((b) => b.claim === 'Sources/Foo/Ghost.swift') &&
      !broken.some((b) => b.claim === 'Sources/Foo/Bar.swift');
  } finally {
    rmSync(swiftFixtureRoot, { recursive: true, force: true });
  }

  // Comment extraction, per comment style. A `#` or `//` inside a string
  // literal is code; a slash-star block spans lines; a wrapped path rejoins.
  const ok13 =
    extractComments("const u = 'https://x/#frag'; // see docs/a.md\n", 'ts').join('|') ===
      'see docs/a.md' &&
    extractComments('/**\n * see docs/architecture/adr-039-pillar-\n * isolation.md\n */\n', 'ts')
      .join('|')
      .includes('docs/architecture/adr-039-pillar-isolation.md') &&
    extractComments('run: echo "# not a comment"\n# see docs/b.md\n', 'yml').join('|') ===
      'see docs/b.md' &&
    extractComments('# see docs/c.md\n', 'toml').join('|') === 'see docs/c.md' &&
    // A `#` mid-word is not a comment marker — shell parameter expansion and a
    // package.json fragment both use one, and taking it as the comment start
    // scans the rest of the line as prose.
    extractComments('pkg = package.json#name # see docs/d.md\n', 'yml').join('|') ===
      'see docs/d.md' &&
    extractComments('V=${LAST_TAG#v} # see docs/d.md\n', 'sh').join('|') === 'see docs/d.md' &&
    // Once a real comment has started, a backtick inside it is just text —
    // the rest of the line is kept verbatim as comment content.
    extractComments('# a `#!/usr/bin/env node` shim, see docs/e.md\n', 'toml').join('|') ===
      'a `#!/usr/bin/env node` shim, see docs/e.md' &&
    // A backtick is a string delimiter in `#`-comment languages too, so a `#`
    // inside shell command substitution is not mistaken for the line's real
    // comment start.
    extractComments('val=`echo x #not-a-comment` # see docs/f.md\n', 'sh').join('|') ===
      'see docs/f.md';

  // A URL's `/docs/` tail is not a repo path; a bare nested doc directory is
  // prose; a one-level `docs/x` is a prose slash. A markdown file anywhere
  // under a docs tree, and a deep root-docs directory, are claims.
  const sourceClaims = extractSourceDocClaims(
    '// see https://mise.jdx.dev/docs/tasks and docs/gone/x.md and docs/gone/deeper\n' +
      '// and pillars/food/docs/architecture/adr-001-a.md and pillars/food/docs/gone/dsl\n' +
      '// which keeps validation off docs/code-only PRs\n',
    'pillars/food/src/x.ts'
  ).map((c) => c.raw);
  const ok14 =
    sourceClaims.includes('docs/gone/x.md') &&
    sourceClaims.includes('docs/gone/deeper') &&
    sourceClaims.includes('pillars/food/docs/architecture/adr-001-a.md') &&
    !sourceClaims.some((c) => c.includes('mise.jdx.dev')) &&
    !sourceClaims.includes('pillars/food/docs/gone/dsl') &&
    !sourceClaims.includes('docs/code-only');

  // End-to-end against a real tree: one dangling doc pointer per newly
  // scanned file type is reported, a resolving one is not, and the string
  // literals this guard's own self-test uses as fixtures are left alone.
  const sourceFixtureRoot = mkdtempSync(join(tmpdir(), 'docs-model-source-'));
  let ok15 = false;
  let ok16 = false;
  try {
    execFileSync('git', ['init', '-q'], { cwd: sourceFixtureRoot });
    mkdirSync(join(sourceFixtureRoot, 'docs', 'architecture'), { recursive: true });
    writeFileSync(join(sourceFixtureRoot, 'docs', 'architecture', 'adr-001-real.md'), '# real\n');
    mkdirSync(join(sourceFixtureRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(join(sourceFixtureRoot, 'scripts'), { recursive: true });
    mkdirSync(join(sourceFixtureRoot, 'libs', 'x', 'src'), { recursive: true });
    writeFileSync(
      join(sourceFixtureRoot, 'libs', 'x', 'src', 'a.ts'),
      '/** See docs/plans/ghost-ts.md. */\nexport const a = 1;\n'
    );
    writeFileSync(
      join(sourceFixtureRoot, 'libs', 'x', 'src', 'b.rs'),
      '//! See docs/plans/ghost-rs.md.\npub fn b() {}\n'
    );
    writeFileSync(
      join(sourceFixtureRoot, '.github', 'workflows', 'w.yml'),
      '# See docs/plans/ghost-yml.md.\nname: w\n'
    );
    writeFileSync(
      join(sourceFixtureRoot, 'scripts', 's.sh'),
      '#!/usr/bin/env bash\n# See docs/plans/ghost-sh.md.\n'
    );
    writeFileSync(
      join(sourceFixtureRoot, 'Cargo.toml'),
      '# See docs/plans/ghost-toml.md and docs/architecture/adr-001-real.md.\n'
    );
    // The fixture strings this guard's own self-test passes to
    // `extractPathClaims` are deliberately unresolvable. They live in string
    // literals, not comments, and must not be reported.
    writeFileSync(
      join(sourceFixtureRoot, 'scripts', 'guard.mjs'),
      "extractPathClaims('`x`', 'docs/thing.md');\n" +
        "extractPathClaims('`y`', 'docs/x.md');\n" +
        "const t = '`docs/architecture/adr-NNN-slug.md`';\n"
    );
    const brokenSource = findBrokenSourceDocPaths(sourceFixtureRoot);
    const claimed = brokenSource.map((b) => b.claim);
    ok15 =
      ['ts', 'rs', 'yml', 'sh', 'toml'].every((kind) =>
        claimed.includes(`docs/plans/ghost-${kind}.md`)
      ) && !claimed.includes('docs/architecture/adr-001-real.md');
    ok16 = !claimed.some((c) => ['docs/thing.md', 'docs/x.md'].includes(c));
  } finally {
    rmSync(sourceFixtureRoot, { recursive: true, force: true });
  }

  // The fixtures live in this very file, so the real tree must be clean too.
  const ok17 = !findBrokenSourceDocPaths(repoRoot).some((b) =>
    b.file.endsWith('scripts/ci/check-docs-model.mjs')
  );

  // A claim that escapes the repo root — `../../../etc/hostname` style — must
  // be reported as broken even when the traversed-to path exists on the host,
  // rather than treated as resolved because `existsSync` alone can't tell the
  // difference between "in the repo" and "reached by climbing out of it".
  const escapeFixtureRoot = mkdtempSync(join(tmpdir(), 'docs-model-escape-'));
  let ok18 = false;
  try {
    execFileSync('git', ['init', '-q'], { cwd: escapeFixtureRoot });
    const outsideFile = join(tmpdir(), 'docs-model-escape-outside.txt');
    writeFileSync(outsideFile, 'not part of the repo\n');
    try {
      const broken = resolvePathClaims(escapeFixtureRoot, [
        {
          file: 'docs/x.md',
          raw: '../docs-model-escape-outside.txt',
          candidates: ['../docs-model-escape-outside.txt'],
        },
      ]);
      ok18 = broken.some((b) => b.claim === '../docs-model-escape-outside.txt');
    } finally {
      rmSync(outsideFile, { force: true });
    }
  } finally {
    rmSync(escapeFixtureRoot, { recursive: true, force: true });
  }

  if (!ok1) console.error('self-test FAILED: unit discovery missed a known unit');
  if (!ok2) console.error('self-test FAILED: banned-dir walk misbehaved');
  if (!ok3) console.error('self-test FAILED: path-claim extraction wrong');
  if (!ok4) console.error('self-test FAILED: relative link not resolved against its own dir');
  if (!ok5) console.error('self-test FAILED: backticked token lacks both candidates');
  if (!ok6) console.error('self-test FAILED: gitignore filter did not detect an ignored path');
  if (!ok7) console.error('self-test FAILED: directory-relative source path not resolved');
  if (!ok8) console.error('self-test FAILED: npm specifier treated as a path claim');
  if (!ok9) console.error('self-test FAILED: absence-heading or Huly-key detection wrong');
  if (!ok10) console.error('self-test FAILED: a unit root no longer yields a path claim');
  if (!ok11)
    console.error('self-test FAILED: a backticked .swift path is not extracted as a claim');
  if (!ok12) console.error('self-test FAILED: a dangling Swift path was not caught end-to-end');
  if (!ok13) console.error('self-test FAILED: comment extraction wrong for some file type');
  if (!ok14) console.error('self-test FAILED: source doc-claim selection wrong');
  if (!ok15)
    console.error('self-test FAILED: a dangling comment pointer was missed in some file type');
  if (!ok16) console.error("self-test FAILED: this guard's own fixture strings were reported");
  if (!ok17) console.error('self-test FAILED: this guard reports itself against the real tree');
  if (!ok18)
    console.error('self-test FAILED: a path claim that escapes the repo root was not caught');
  return (
    ok1 &&
    ok2 &&
    ok3 &&
    ok4 &&
    ok5 &&
    ok6 &&
    ok7 &&
    ok8 &&
    ok9 &&
    ok10 &&
    ok11 &&
    ok12 &&
    ok13 &&
    ok14 &&
    ok15 &&
    ok16 &&
    ok17 &&
    ok18
  );
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '')) {
  main();
}
