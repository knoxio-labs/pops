#!/usr/bin/env node
/**
 * Line-budget headroom guard.
 *
 * `.oxlintrc.json` enforces `max-lines: 200` (skipping blank lines and
 * comments) on most TS/TSX/JS source. Nothing evaluates that rule against a
 * file the current commit did not stage, so a branch that only appends a
 * handful of lines to a file another branch also grew can rebase straight
 * past the cap with every local gate green — and the failure lands on
 * whichever PR merges second, on a diff that never touched the line count
 * itself. In the incident that prompted this guard, a file sitting at
 * exactly 200 counted lines on `main` took one added line from a rebasing
 * branch to 201, and every local check (`oxfmt --check`, `tsc --noEmit`, the
 * full test suite) had nothing to say about it because none of them count
 * lines.
 *
 * WHAT THIS SIMULATES. For each linted file the branch touches, this
 * approximates "what the file will look like once this branch lands on the
 * target branch's current tip" without doing a real merge:
 *
 *   approxCount = countAt(target-tip) + (countAt(branch-head) - countAt(merge-base))
 *
 * The second term is this branch's OWN net change to the file's counted line
 * total, measured against its own merge-base — not against the target's
 * current tip, which the branch has never seen. Adding that delta to the
 * target's CURRENT count (not the merge-base's, which may be stale by
 * however many commits the target has taken since this branch forked) is the
 * cheap approximation the ticket asks for: it does not require an actual
 * merge, so it cannot fail on a content conflict, and it is exact whenever
 * neither side touches the same lines — which is the common case for a file
 * two branches both merely append to.
 *
 * It is an approximation, not a re-implementation of `git merge`: if both
 * sides edit overlapping lines, the real merged line count can differ from
 * this estimate. That is why crossing the cap here is a hard failure (it
 * reproduces the exact incident this guard exists for) while approaching it
 * is a warning, not a second, slightly-wrong enforcement of the same rule
 * oxlint already owns.
 *
 * COUNTING SEMANTICS mirror the oxlint rule's own options
 * (`skipBlankLines: true, skipComments: true`): a line that is only
 * whitespace, or only comment (line or block, including a line fully inside
 * a multi-line block comment), does not count. This is a best-effort
 * tokenizer, not oxc's real parser — it tracks strings, template literals,
 * comments and regex literals, and nothing else.
 *
 * WHICH DIRECTION IT MISSES IN, because that is the part that matters. An
 * over-count costs a false alarm; an UNDER-count silently passes a file that
 * is genuinely over budget, which is the failure this guard exists to
 * prevent. Regex literals are tracked for exactly that reason: `/\/*$/`
 * leaves `/*` adjacent, and reading that as a block comment swallowed whole
 * files (a 6-line fixture counted 1). The residue is JSX text — an
 * apostrophe in `<p>It's fine</p>` opens a string state that runs to the next
 * quote — which over-counts, and cannot be fixed without a real parser.
 * Measured against `oxlint`'s own `max-lines` count over all 4851 linted
 * files in this repo: 4850 exact, one +3, zero under-counts.
 *
 * FAILURE MODES ARE LOUD. Every path where the guard cannot answer — an
 * unresolvable base ref, no merge base (a shallow clone), a `git diff` that
 * failed, a file `git show` refused, an `.oxlintrc.json` shape it does not
 * model — prints to stderr and exits non-zero. "Nothing to ask" (HEAD is the
 * base branch itself) is the single case that passes quietly.
 *
 * TIER — install-free (Tier A, ADR-045 amendment). Reads `.oxlintrc.json`
 * with `JSON.parse` and shells out to `git`; no third-party import at any
 * depth.
 *
 * Usage:
 *   node scripts/ci/check-line-budget-headroom.mjs [--base <ref>] [--headroom <n>]
 *   node scripts/ci/check-line-budget-headroom.mjs --self-test
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/**
 * Extensions the `max-lines` rule actually applies to. `.mts`/`.cts` are in
 * the list because `oxlint -c .oxlintrc.json` caps them today, even though
 * the repo tracks none — an extension missing here is a file the guard never
 * looks at.
 */
const LINTED_EXT = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

/** How close to the cap counts as "discoverable before it's a problem". */
const DEFAULT_HEADROOM = 10;

// ---------------------------------------------------------------------------
// Glob matching — just enough of oxlint's `overrides[].files` shape: `**`,
// `*`, `?` and `{a,b,c}` brace alternation (nested and repeated groups expand
// by recursion). Anything outside that subset — `!` negation, a `[...]`
// character class, an `extglob` group — throws `UnsupportedGlobError` rather
// than being matched literally: a pattern the matcher cannot model decides
// whether a file is EXEMPT, so guessing either way is a silent wrong answer
// (ADR-045, "a shape the guard does not model is a violation, not a pass").
// ---------------------------------------------------------------------------

/** A glob outside the subset this matcher models. */
export class UnsupportedGlobError extends Error {
  /** @param {string} glob */
  constructor(glob) {
    super(
      `unsupported glob "${glob}" — this matcher models only *, **, ? and {a,b} alternation. ` +
        'Teach globToRegExp the new syntax (and its exemption semantics) before using it in .oxlintrc.json.'
    );
    this.name = 'UnsupportedGlobError';
  }
}

/**
 * @param {string} glob
 * @returns {RegExp}
 */
export function globToRegExp(glob) {
  const braceMatch = /\{([^{}]*)\}/.exec(glob);
  if (braceMatch) {
    const [whole, body] = braceMatch;
    const alternatives = body.split(',');
    const pattern = alternatives
      .map(
        (alt) =>
          globToRegExp(
            glob.slice(0, braceMatch.index) + alt + glob.slice(braceMatch.index + whole.length)
          ).source
      )
      .join('|');
    return new RegExp(`^(?:${pattern})$`);
  }
  if (/[!()[\]{}]/.test(glob)) throw new UnsupportedGlobError(glob);
  let out = '^';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i += 1;
        if (glob[i + 1] === '/') {
          // `**/` spans whole path SEGMENTS, including none at all. `.*` here
          // would also swallow half a segment, so `**/test-utils.ts` would
          // exempt `db-test-utils.ts` — a file oxlint caps.
          out += '(?:[^/]+/)*';
          i += 1;
        } else {
          out += '.*';
        }
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') {
      out += '[^/]';
    } else if (c === '.') {
      out += '\\.';
    } else if ('+^$|\\'.includes(c)) {
      out += `\\${c}`;
    } else {
      out += c;
    }
  }
  return new RegExp(`${out}$`);
}

/**
 * @param {string} relPath POSIX-style, repo-relative.
 * @param {string[]} globs
 * @returns {boolean}
 */
export function matchesAnyGlob(relPath, globs) {
  return globs.some((g) => globToRegExp(g).test(relPath));
}

/**
 * The cap, every glob that turns `max-lines` off for the files it matches,
 * every glob oxlint does not lint at all, and every config shape this cannot
 * model.
 *
 * `exemptGlobs` is "any override says off", which equals oxlint's real
 * last-write-wins ordering only while no LATER override turns `max-lines`
 * back on or moves the cap. That is true of `.oxlintrc.json` today, and it is
 * `unmodelled` that keeps it true: an override naming `max-lines` as anything
 * other than `"off"` is reported, not quietly averaged into a cap that is now
 * wrong for the files it covers. Same for a rule that has stopped being
 * configured at all — projecting a phantom 200 against a config that no
 * longer sets one is a guess, and this guard does not guess.
 *
 * @param {unknown} oxlintConfig Parsed `.oxlintrc.json`.
 * @returns {{ max: number, exemptGlobs: string[], ignoreGlobs: string[], unmodelled: string[] }}
 */
export function parseMaxLinesConfig(oxlintConfig) {
  const config = /** @type {Record<string, unknown>} */ (oxlintConfig);
  const rules = /** @type {Record<string, unknown>} */ (config.rules ?? {});
  const rule = rules['max-lines'];
  const max =
    Array.isArray(rule) && typeof rule[1] === 'object' && rule[1] !== null && 'max' in rule[1]
      ? Number(/** @type {{ max: unknown }} */ (rule[1]).max)
      : 200;

  /** @type {string[]} */
  const exemptGlobs = [];
  /** @type {string[]} */
  const unmodelled = [];

  if (rule === undefined) {
    unmodelled.push(
      'rules["max-lines"] is absent — nothing configures the cap this guard projects against'
    );
  } else if (!Array.isArray(rule) || typeof rule[1] !== 'object' || rule[1] === null) {
    unmodelled.push(
      `rules["max-lines"] is ${JSON.stringify(rule)} — expected ["<level>", { "max": <n> }]`
    );
  }

  const overrides = Array.isArray(config.overrides) ? config.overrides : [];
  for (const [index, override] of overrides.entries()) {
    if (typeof override !== 'object' || override === null) continue;
    const o = /** @type {Record<string, unknown>} */ (override);
    const overrideRules = /** @type {Record<string, unknown>} */ (o.rules ?? {});
    const overrideRule = overrideRules['max-lines'];
    if (overrideRule === undefined) continue;
    if (overrideRule !== 'off') {
      unmodelled.push(
        `overrides[${index}] sets max-lines to ${JSON.stringify(overrideRule)} rather than "off" — ` +
          'this guard models only the global cap and a full exemption'
      );
      continue;
    }
    if (!Array.isArray(o.files)) {
      unmodelled.push(`overrides[${index}] turns max-lines off but has no "files" array`);
      continue;
    }
    for (const f of o.files) {
      if (typeof f === 'string') exemptGlobs.push(f);
      else unmodelled.push(`overrides[${index}].files contains a non-string entry`);
    }
  }

  // A file oxlint never lints has no cap to cross. Bare directory names
  // (`dist`) are segment matches in this dialect, not filename globs.
  /** @type {string[]} */
  const ignoreGlobs = [];
  const rawIgnores = Array.isArray(config.ignorePatterns) ? config.ignorePatterns : [];
  for (const entry of rawIgnores) {
    if (typeof entry !== 'string') continue;
    ignoreGlobs.push(/[*?/]/.test(entry) ? entry : `**/${entry}/**`);
  }

  return { max: Number.isFinite(max) && max > 0 ? max : 200, exemptGlobs, ignoreGlobs, unmodelled };
}

// ---------------------------------------------------------------------------
// Comment/blank-aware line counting.
// ---------------------------------------------------------------------------

/**
 * Characters after which a `/` opens a regex literal rather than dividing.
 * `<` and `>` are deliberately absent: in TSX they are far more often a tag
 * than an operator, and `</div>` must stay ordinary code.
 */
const REGEX_ALLOWED_AFTER = new Set([
  '(',
  ',',
  '=',
  ':',
  '[',
  '!',
  '&',
  '|',
  '?',
  ';',
  '{',
  '}',
  '+',
  '-',
  '*',
  '%',
  '^',
  '~',
]);

/** Keywords after which the same is true. */
const REGEX_ALLOWED_AFTER_WORD = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'do',
  'else',
  'case',
  'yield',
  'await',
  'throw',
  'void',
]);

/**
 * Count lines that are neither blank nor comment-only, mirroring
 * `skipBlankLines: true, skipComments: true`.
 *
 * @param {string} source
 * @returns {number}
 */
export function countBudgetLines(source) {
  const lines = source.split('\n');
  const codeOnLine = Array.from({ length: lines.length }, () => false);

  /** @type {'normal' | 'line-comment' | 'block-comment' | 'string' | 'template' | 'regex'} */
  let state = 'normal';
  let stringQuote = '';
  let lineIndex = 0;
  /** Last non-whitespace character seen in `normal` state. */
  let lastSignificant = '';
  /** The identifier being accumulated, so a keyword before `/` is visible. */
  let word = '';
  let inCharClass = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === '\n') {
      // A regex literal cannot contain a raw newline, so an opener this
      // mis-read costs at most the rest of ONE line — a line already counted
      // as code by the `/` itself.
      if (state === 'line-comment' || state === 'regex') state = 'normal';
      lineIndex += 1;
      continue;
    }

    if (state === 'normal') {
      if (ch === '/' && next === '/') {
        state = 'line-comment';
        i += 1;
        continue;
      }
      if (ch === '/' && next === '*') {
        state = 'block-comment';
        i += 1;
        continue;
      }
      if (
        ch === '/' &&
        (lastSignificant === '' ||
          REGEX_ALLOWED_AFTER.has(lastSignificant) ||
          (/[A-Za-z_$]/.test(lastSignificant) && REGEX_ALLOWED_AFTER_WORD.has(word)))
      ) {
        // `.replace(/\/*$/, '')` — the escaped slash leaves `/*` adjacent, and
        // reading that as a block comment silently swallows the rest of the
        // file. Tracking the literal is what keeps this counter from
        // UNDER-counting an over-budget file into a clean pass.
        state = 'regex';
        inCharClass = false;
        codeOnLine[lineIndex] = true;
        lastSignificant = '/';
        word = '';
        continue;
      }
      if (ch === '"' || ch === "'") {
        state = 'string';
        stringQuote = ch;
        codeOnLine[lineIndex] = true;
        lastSignificant = ch;
        word = '';
        continue;
      }
      if (ch === '`') {
        state = 'template';
        codeOnLine[lineIndex] = true;
        lastSignificant = ch;
        word = '';
        continue;
      }
      if (!/\s/.test(ch)) {
        codeOnLine[lineIndex] = true;
        lastSignificant = ch;
        word = /[A-Za-z0-9_$]/.test(ch) ? word + ch : '';
      }
      continue;
    }

    if (state === 'line-comment') continue;

    if (state === 'block-comment') {
      if (ch === '*' && next === '/') {
        state = 'normal';
        i += 1;
      }
      continue;
    }

    if (state === 'regex') {
      codeOnLine[lineIndex] = true;
      if (ch === '\\') {
        i += 1;
      } else if (ch === '[') {
        inCharClass = true;
      } else if (ch === ']') {
        inCharClass = false;
      } else if (ch === '/' && !inCharClass) {
        state = 'normal';
        lastSignificant = '/';
        word = '';
      }
      continue;
    }

    if (state === 'string') {
      codeOnLine[lineIndex] = true;
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === stringQuote) state = 'normal';
      continue;
    }

    if (state === 'template') {
      codeOnLine[lineIndex] = true;
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === '`') state = 'normal';
      continue;
    }
  }

  return codeOnLine.filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Git plumbing.
// ---------------------------------------------------------------------------

/**
 * git's repository-location overrides, removed from every invocation here.
 * `.husky/pre-push` runs this guard with `GIT_DIR` exported for the repo
 * being pushed; without the scrub, the self-test's throwaway fixtures would
 * commit into THAT repo instead of their own temp directory. Same regression
 * `scripts/ci/resolve-report-base.mjs` documents.
 *
 * @returns {Record<string, string | undefined>}
 */
function gitEnv() {
  const env = { ...process.env };
  for (const name of [
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_INDEX_FILE',
    'GIT_COMMON_DIR',
    'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_PREFIX',
    'GIT_QUARANTINE_PATH',
    'GIT_NAMESPACE',
  ]) {
    delete env[name];
  }
  return env;
}

/**
 * @param {string[]} args
 * @param {string} cwd
 * @returns {string}
 */
function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: gitEnv(),
    maxBuffer: 64 * 1024 * 1024,
  });
}

/**
 * @param {string[]} args
 * @param {string} cwd
 * @returns {string | undefined}
 */
function tryGit(args, cwd) {
  try {
    return git(args, cwd).trim();
  } catch {
    return undefined;
  }
}

/**
 * A file's content at a ref, distinguishing "not there" from "git refused to
 * say" — the two the obvious `try { git show } catch { undefined }` collapses
 * into one, which is how a file the guard cannot read becomes a file with
 * nothing to report (ADR-045, no bare `catch` between finding the subject and
 * reporting on it).
 *
 * @param {string} ref
 * @param {string} path
 * @param {string} cwd
 * @returns {{ kind: 'blob', text: string } | { kind: 'absent' } | { kind: 'error', message: string }}
 */
function readBlob(ref, path, cwd) {
  const type = tryGit(['cat-file', '-t', `${ref}:${path}`], cwd);
  if (type === undefined) return { kind: 'absent' };
  if (type !== 'blob') return { kind: 'absent' }; // a directory, or a submodule gitlink — no lines to budget.
  try {
    return { kind: 'blob', text: git(['show', `${ref}:${path}`], cwd) };
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message.split('\n')[0] : String(error),
    };
  }
}

/**
 * The ref a base name resolves to, or `undefined`.
 *
 * `merge_group.base_ref` is a FULL ref (`refs/heads/main`) where
 * `github.base_ref` is a bare branch name — the difference
 * `.github/workflows/README.md` records and `agent-review.yml` strips inline.
 * Stripping it here rather than in the workflow keeps the guard right however
 * it is called: unstripped, a queue run resolves nothing, skips, and exits 0
 * in the one lane where a second-PR line-budget failure actually lands.
 *
 * @param {string} baseRef
 * @param {string} cwd
 * @returns {{ ref: string, tried: string[] } | { ref: undefined, tried: string[] }}
 */
function resolveBaseRef(baseRef, cwd) {
  const bare = baseRef.replace(/^refs\/heads\//, '');
  const candidates = [...new Set([`origin/${bare}`, bare, `refs/remotes/origin/${bare}`, baseRef])];
  for (const candidate of candidates) {
    if (tryGit(['rev-parse', '--verify', `${candidate}^{commit}`], cwd) !== undefined) {
      return { ref: candidate, tried: candidates };
    }
  }
  return { ref: undefined, tried: candidates };
}

/**
 * @param {number} count
 * @param {number} max
 * @param {number} headroom
 * @returns {'fail' | 'warn' | 'ok'}
 */
function verdictStatus(count, max, headroom) {
  if (count > max) return 'fail';
  if (count >= max - headroom) return 'warn';
  return 'ok';
}

/**
 * @typedef {object} FileVerdict
 * @property {string} file
 * @property {'ok' | 'warn' | 'fail' | 'new-file'} status
 * @property {number} approxCount
 * @property {number} max
 * @property {number} baseHeadCount
 * @property {number} branchDelta
 */

/**
 * @param {object} params
 * @param {string} params.cwd
 * @param {string} params.baseRef Local or `origin/<ref>`-resolved branch name.
 * @param {number} params.headroom
 * @returns {{ verdicts: FileVerdict[], skippedReason?: string, fatal?: boolean }}
 *   `skippedReason` with `fatal: true` means the question could not be
 *   answered and the caller must not read a pass into it; without `fatal` it
 *   means there was genuinely nothing to ask.
 */
export function evaluate({ cwd, baseRef, headroom }) {
  const configPath = join(repoRoot, '.oxlintrc.json');
  /** @type {unknown} */
  let rawConfig;
  try {
    rawConfig = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    return {
      verdicts: [],
      skippedReason: `cannot read ${configPath} (${error instanceof Error ? error.message.split('\n')[0] : String(error)}) — no cap to project against`,
      fatal: true,
    };
  }

  const { max, exemptGlobs, ignoreGlobs, unmodelled } = parseMaxLinesConfig(rawConfig);
  if (unmodelled.length > 0) {
    return {
      verdicts: [],
      skippedReason: `.oxlintrc.json has max-lines shapes this guard does not model: ${unmodelled.join('; ')}`,
      fatal: true,
    };
  }

  /** @type {(path: string) => boolean} */
  let isExempt;
  try {
    const skipGlobs = [...exemptGlobs, ...ignoreGlobs];
    for (const glob of skipGlobs) globToRegExp(glob);
    isExempt = (path) => matchesAnyGlob(path, skipGlobs);
  } catch (error) {
    return {
      verdicts: [],
      skippedReason: error instanceof Error ? error.message : String(error),
      fatal: true,
    };
  }

  const { ref: resolvedBase, tried } = resolveBaseRef(baseRef, cwd);

  if (resolvedBase === undefined) {
    return {
      verdicts: [],
      skippedReason: `cannot resolve base ref "${baseRef}" (tried ${tried.join(', ')}) — nothing to project onto`,
      fatal: true,
    };
  }

  const currentBranch = tryGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  if (currentBranch === baseRef.replace(/^refs\/heads\//, '')) {
    return {
      verdicts: [],
      skippedReason: `HEAD is ${currentBranch} itself — nothing to land on top of`,
    };
  }

  const mergeBase = tryGit(['merge-base', resolvedBase, 'HEAD'], cwd);
  if (mergeBase === undefined) {
    return {
      verdicts: [],
      skippedReason:
        `no merge-base between ${resolvedBase} and HEAD — a shallow clone or an unrelated history. ` +
        'Fetch full history (actions/checkout `fetch-depth: 0`) and run again',
      fatal: true,
    };
  }

  // `-z` rather than newline-splitting: `git diff --name-only` C-quotes any
  // path with a non-ASCII byte, a quote or a backslash in it, and the quoted
  // spelling matches neither LINTED_EXT nor a later `git show` — an
  // over-budget file would drop out of the list without a word.
  const changedRaw = tryGit(
    [
      '-c',
      'core.quotePath=false',
      'diff',
      '-z',
      '--name-only',
      '--diff-filter=ACMR',
      mergeBase,
      'HEAD',
    ],
    cwd
  );
  if (changedRaw === undefined) {
    return {
      verdicts: [],
      skippedReason: `git diff ${mergeBase}..HEAD failed — the touched-file list is unknown, which is not the same as empty`,
      fatal: true,
    };
  }
  const changed = changedRaw
    .split('\0')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && LINTED_EXT.test(l) && !isExempt(l));

  /** @type {FileVerdict[]} */
  const verdicts = [];
  /** @type {string[]} */
  const unreadable = [];

  for (const file of changed) {
    const branchHead = readBlob('HEAD', file, cwd);
    if (branchHead.kind === 'error') {
      unreadable.push(`${file} at HEAD (${branchHead.message})`);
      continue;
    }
    if (branchHead.kind === 'absent') continue; // deleted in a later commit on this branch — nothing to budget.

    const baseHead = readBlob(resolvedBase, file, cwd);
    if (baseHead.kind === 'error') {
      unreadable.push(`${file} at ${resolvedBase} (${baseHead.message})`);
      continue;
    }
    const branchHeadCount = countBudgetLines(branchHead.text);

    if (baseHead.kind === 'absent') {
      // Genuinely new to the target branch — no race with another branch is
      // possible yet, but a file already over budget on its own is still
      // worth surfacing here rather than waiting for oxlint to say the same
      // thing in a slower round trip.
      const rawStatus = verdictStatus(branchHeadCount, max, headroom);
      const status = rawStatus === 'warn' ? 'new-file' : rawStatus;
      verdicts.push({
        file,
        status,
        approxCount: branchHeadCount,
        max,
        baseHeadCount: 0,
        branchDelta: branchHeadCount,
      });
      continue;
    }

    const branchBase = readBlob(mergeBase, file, cwd);
    if (branchBase.kind === 'error') {
      unreadable.push(`${file} at ${mergeBase} (${branchBase.message})`);
      continue;
    }
    const branchBaseCount = branchBase.kind === 'absent' ? 0 : countBudgetLines(branchBase.text);
    const baseHeadCount = countBudgetLines(baseHead.text);
    const branchDelta = branchHeadCount - branchBaseCount;
    const approxCount = baseHeadCount + branchDelta;

    const status = verdictStatus(approxCount, max, headroom);
    verdicts.push({ file, status, approxCount, max, baseHeadCount, branchDelta });
  }

  if (unreadable.length > 0) {
    return {
      verdicts,
      skippedReason: `git could not read ${unreadable.length} touched file(s): ${unreadable.join('; ')}`,
      fatal: true,
    };
  }

  return { verdicts };
}

/**
 * @param {FileVerdict[]} verdicts
 * @returns {boolean} true if there were no failures.
 */
function report(verdicts) {
  const failures = verdicts.filter((v) => v.status === 'fail');
  const warnings = verdicts.filter((v) => v.status === 'warn' || v.status === 'new-file');

  if (failures.length === 0 && warnings.length === 0) {
    console.log(
      'OK — no touched file is projected over its oxlint max-lines cap on the target branch.'
    );
    return true;
  }

  for (const v of warnings) {
    if (v.status === 'new-file') {
      console.warn(
        `WARN  ${v.file}: new file at ${v.approxCount} lines, within ${v.max - v.approxCount} of the ${v.max}-line cap.`
      );
    } else {
      console.warn(
        `WARN  ${v.file}: ~${v.approxCount} lines once this lands on top of the target branch ` +
          `(target currently ${v.baseHeadCount}, this branch ${v.branchDelta >= 0 ? '+' : ''}${v.branchDelta}) — within ${v.max - v.approxCount} of the ${v.max}-line cap.`
      );
    }
  }

  for (const v of failures) {
    console.error(
      `FAIL  ${v.file}: ~${v.approxCount} lines once this lands on top of the target branch ` +
        `(target currently ${v.baseHeadCount}, this branch ${v.branchDelta >= 0 ? '+' : ''}${v.branchDelta}) — ` +
        `${v.approxCount - v.max} over the ${v.max}-line oxlint cap.`
    );
  }

  if (failures.length > 0) {
    console.error(
      '\nA rebase onto the target branch would push this file over its oxlint `max-lines` cap ' +
        'even though this branch alone stays under it. Split the file before pushing — see ' +
        'docs/architecture/adr-045-guards-must-prove-they-report.md.'
    );
  }

  return failures.length === 0;
}

/**
 * @returns {boolean}
 */
function run() {
  const args = process.argv.slice(2);
  const baseIdx = args.indexOf('--base');
  const baseRef = baseIdx >= 0 ? args[baseIdx + 1] : 'main';
  const headroomIdx = args.indexOf('--headroom');
  const headroom = headroomIdx >= 0 ? Number(args[headroomIdx + 1]) : DEFAULT_HEADROOM;

  if (baseRef === undefined || baseRef.length === 0 || baseRef.startsWith('--')) {
    console.error('check-line-budget-headroom: --base needs a ref (e.g. --base main).');
    return false;
  }
  if (!Number.isFinite(headroom) || headroom < 0) {
    console.error('check-line-budget-headroom: --headroom needs a non-negative number.');
    return false;
  }

  if (
    !existsSync(join(repoRoot, '.git')) &&
    tryGit(['rev-parse', '--show-toplevel'], repoRoot) === undefined
  ) {
    console.error('check-line-budget-headroom: not inside a git repository.');
    return false;
  }

  const { verdicts, skippedReason, fatal } = evaluate({ cwd: repoRoot, baseRef, headroom });
  if (skippedReason !== undefined) {
    // A guard that cannot answer says so on stderr and exits non-zero. The
    // alternative — a friendly line on stdout and exit 0 — is the shape
    // ADR-045 was written about: a gate that reports success when it did not
    // look. Only "there was nothing to ask" (HEAD is the base branch) passes.
    if (fatal === true) {
      // Whatever it DID manage to judge still prints: a file it could not read
      // does not un-find the file it already projected over the cap.
      if (verdicts.length > 0) report(verdicts);
      console.error(`check-line-budget-headroom: cannot answer — ${skippedReason}.`);
      return false;
    }
    console.log(`check-line-budget-headroom: skipped — ${skippedReason}.`);
    return true;
  }

  return report(verdicts);
}

/**
 * Plants the rebase-tips-a-shared-file-over-budget shape in throwaway repos
 * and proves the guard
 * reports it — including the half a frozen-target fixture cannot prove, where
 * the target branch moves after the fork and the branch's own head is under
 * the cap. A fixture whose `main` never moves passes just as happily with the
 * projection deleted, which is the ADR-045 failure mode this file is supposed
 * to be an example of avoiding, not an instance of.
 *
 * Alongside the positive cases, the degenerate ones: a base ref that will not
 * resolve, a config shape the parser does not model, a path `git diff` quotes,
 * a filename that only looks exempt. Each must produce a verdict, never
 * silence.
 *
 * @returns {boolean}
 */
function selfTest() {
  const checks = {};

  // --- glob matching -------------------------------------------------------
  checks['matches a **/*.test.ts pattern'] = matchesAnyGlob('pillars/food/src/x.test.ts', [
    '**/*.test.{ts,tsx,js,mjs}',
  ]);
  checks['does not match a plain source file'] = !matchesAnyGlob('pillars/food/src/x.ts', [
    '**/*.test.{ts,tsx,js,mjs}',
  ]);
  checks['matches a single-star segment pattern'] = matchesAnyGlob(
    'pillars/purchases/src/contract/purchase.generated.ts',
    ['pillars/*/src/contract/*.generated.ts']
  );
  checks['does not match across a deeper path than a single star allows'] = !matchesAnyGlob(
    'pillars/purchases/src/contract/schemas/deep/purchase.generated.ts',
    ['pillars/*/src/contract/*.generated.ts']
  );
  // `**/` spans whole segments. Matching half of one exempts `db-test-utils.ts`
  // from a rule oxlint applies to it — a silent pass, verified against
  // `oxlint -c .oxlintrc.json` on a 250-line file of that name.
  checks['**/ does not match half a path segment'] = !matchesAnyGlob(
    'pillars/food/src/db/db-test-utils.ts',
    ['**/test-utils.ts']
  );
  checks['**/ still matches the file it names, at any depth'] =
    matchesAnyGlob('pillars/food/src/db/test-utils.ts', ['**/test-utils.ts']) &&
    matchesAnyGlob('test-utils.ts', ['**/test-utils.ts']);
  checks['a glob shape the matcher cannot model throws rather than guessing'] = (() => {
    try {
      globToRegExp('!**/*.test.ts');
      return false;
    } catch (error) {
      return error instanceof UnsupportedGlobError;
    }
  })();

  // --- config parsing --------------------------------------------------------
  const parsed = parseMaxLinesConfig({
    rules: { 'max-lines': ['error', { max: 200 }] },
    overrides: [
      { files: ['**/*.test.ts'], rules: { 'max-lines': 'off' } },
      { files: ['libs/ui/src/**/*.ts'], rules: { 'max-lines-per-function': 'off' } },
    ],
  });
  checks['reads the configured max'] = parsed.max === 200;
  checks['collects only max-lines: off overrides'] = parsed.exemptGlobs.length === 1;
  checks['exempt glob is the test pattern'] = parsed.exemptGlobs[0] === '**/*.test.ts';
  checks['the real .oxlintrc.json parses with nothing unmodelled'] =
    parseMaxLinesConfig(JSON.parse(readFileSync(join(repoRoot, '.oxlintrc.json'), 'utf8')))
      .unmodelled.length === 0;
  // Overrides apply last-write-wins, so an override that RAISES the cap rather
  // than removing it is a shape "exempt if any override says off" gets wrong.
  // It has to be reported, not averaged away.
  checks['an override that moves the cap is reported, not ignored'] =
    parseMaxLinesConfig({
      rules: { 'max-lines': ['error', { max: 200 }] },
      overrides: [{ files: ['libs/**/*.ts'], rules: { 'max-lines': ['error', { max: 400 }] } }],
    }).unmodelled.length === 1;
  checks['max-lines written as ["off"] is reported rather than read as off'] =
    parseMaxLinesConfig({
      rules: { 'max-lines': ['error', { max: 200 }] },
      overrides: [{ files: ['libs/**/*.ts'], rules: { 'max-lines': ['off'] } }],
    }).unmodelled.length === 1;
  checks['a config that no longer sets max-lines is reported'] =
    parseMaxLinesConfig({ rules: {} }).unmodelled.length === 1;
  checks['ignorePatterns become exemptions — oxlint never lints those files'] = (() => {
    const { ignoreGlobs } = parseMaxLinesConfig({
      rules: { 'max-lines': ['error', { max: 200 }] },
      ignorePatterns: ['dist', '**/*.config.ts'],
    });
    return (
      matchesAnyGlob('pillars/shell/vite.config.ts', ignoreGlobs) &&
      matchesAnyGlob('libs/ui/dist/index.js', ignoreGlobs) &&
      !matchesAnyGlob('libs/ui/src/index.ts', ignoreGlobs)
    );
  })();

  // --- comment/blank-aware counting ------------------------------------------
  const sample = [
    'const a = 1;', // code
    '', // blank
    '// a line comment', // comment
    '/* a block comment */', // comment, single line
    '/*', // comment start
    ' * spans two lines', // comment
    ' */', // comment end
    'const s = "// not a comment";', // code (string contains //)
    'const t = `line one', // code (template starts)
    'still inside the template`;', // code (template continues)
  ].join('\n');
  checks['counts only real code lines'] = countBudgetLines(sample) === 4;
  checks['an all-blank file counts zero'] = countBudgetLines('\n\n   \n\t\n') === 0;
  checks['an all-comment file counts zero'] = countBudgetLines('// one\n// two\n/* three */') === 0;

  // A regex literal whose escaped slash leaves `/*` adjacent. Read as a block
  // comment, it swallows every line after it — the one miscount direction
  // that turns an over-budget file into a clean pass. oxlint counts 4 here.
  const regexSample = [
    "const strip = (s) => s.replace(/\\/*$/, '');",
    'const a = 1;',
    '// a comment that must still not count',
    'const b = 2;',
    'const c = 3;',
  ].join('\n');
  checks['a regex literal containing /* does not swallow the rest of the file'] =
    countBudgetLines(regexSample) === 4;
  checks['division is still division, not a regex'] =
    countBudgetLines('const r = a / b; // c') === 1;
  checks['a regex literal holding a quote does not open a string'] =
    countBudgetLines('const re = /([\'"])x\\1/;\n\n// only a comment\nconst d = 1;') === 2;

  // --- end-to-end: plant the shared-file-over-budget shape in a throwaway repo ---
  const exec = execFileSync;
  const dir = tmpRepo();
  try {
    const capLine = () => 'const line = 1;';
    const bodyLines = (n) => Array.from({ length: n }, capLine).join('\n');

    // Common ancestor: shared.ts already at exactly 200 lines, shared2.ts at
    // 194 (ten below the cap), unrelated.ts present but never touched again
    // by either branch. Both later branches fork from this one commit, so a
    // merge-base lookup always finds both shared files already there — the
    // scenario this guard exists for is two branches that each only APPEND
    // to a file that predates both of them.
    writeAndCommit(
      dir,
      'shared.ts',
      `${bodyLines(200)}\n`,
      'base: shared.ts at exactly 200 lines, shared2.ts at 194'
    );
    writeAndCommit(dir, 'shared2.ts', `${bodyLines(194)}\n`, 'base: shared2.ts at 194 lines');
    writeAndCommit(
      dir,
      'unrelated.ts',
      'const other = 1;\n',
      'base: a file neither branch will touch'
    );
    exec('git', ['checkout', '-q', '-b', 'feature'], { cwd: dir });
    writeAndCommit(
      dir,
      'shared.ts',
      `${bodyLines(200)}\nconst extra = 1;\n`,
      'feature: add one line to shared.ts'
    );

    // `main` never touches shared.ts after the fork — the ticket's shape is
    // that the SECOND branch to land is the one that tips it over, and here
    // that is simply "whatever feature's own delta does to the base count".
    const { verdicts } = evaluate({ cwd: dir, baseRef: 'main', headroom: DEFAULT_HEADROOM });
    const shared = verdicts.find((v) => v.file === 'shared.ts');
    checks['plants the shared-file-over-budget shape and catches it'] = shared?.status === 'fail';
    checks['reports the correct projected count'] = shared?.approxCount === 201;

    // Warning case: shared2.ts starts ten below the cap; feature nudges it
    // by one, landing inside the headroom band but not over it.
    writeAndCommit(dir, 'shared2.ts', `${bodyLines(195)}\n`, 'feature: nudge shared2.ts to 195');

    const second = evaluate({ cwd: dir, baseRef: 'main', headroom: DEFAULT_HEADROOM });
    const shared2 = second.verdicts.find((v) => v.file === 'shared2.ts');
    checks['warns inside the headroom band without failing'] = shared2?.status === 'warn';

    checks['stays quiet on a file neither branch touched near the cap'] = !second.verdicts.some(
      (v) => v.file === 'unrelated.ts'
    );

    // Exemption: a *.test.ts file over budget must never be reported.
    writeAndCommit(
      dir,
      'shared.test.ts',
      `${bodyLines(250)}\n`,
      'feature: an over-budget test file, which max-lines exempts'
    );
    const third = evaluate({ cwd: dir, baseRef: 'main', headroom: DEFAULT_HEADROOM });
    checks['honours the real .oxlintrc.json test-file exemption'] = !third.verdicts.some(
      (v) => v.file === 'shared.test.ts'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  // --- end-to-end: the target branch MOVES after the fork --------------------
  // The case above cannot fail if the projection is deleted outright: with
  // `main` frozen at the merge-base, the target's count and the merge-base's
  // count are the same number, and `countAt(head)` alone gets the same answer.
  // This one separates them. `feature` is 196 lines on its own — nothing local
  // to see — and only crosses the cap because `main` grew underneath it. That
  // is the failure mode this guard exists for.
  const moved = tmpRepo();
  try {
    const bodyLines = (n, tag = 'x') =>
      Array.from({ length: n }, (_, i) => `const ${tag}${i} = 1;`).join('\n');

    writeAndCommit(moved, 'shared.ts', `${bodyLines(195)}\n`, 'ancestor: shared.ts at 195');
    execFileSync('git', ['checkout', '-q', '-b', 'feature'], { cwd: moved, env: gitEnv() });
    writeAndCommit(moved, 'shared.ts', `${bodyLines(196)}\n`, 'feature: +1, own head only 196');
    execFileSync('git', ['checkout', '-q', 'main'], { cwd: moved, env: gitEnv() });
    writeAndCommit(
      moved,
      'shared.ts',
      `${bodyLines(195)}\n${bodyLines(5, 'm')}\n`,
      'main: another branch already landed +5, taking it to 200'
    );
    execFileSync('git', ['checkout', '-q', 'feature'], { cwd: moved, env: gitEnv() });

    const projected = evaluate({ cwd: moved, baseRef: 'main', headroom: DEFAULT_HEADROOM });
    const shared = projected.verdicts.find((v) => v.file === 'shared.ts');
    checks['projects the branch delta onto the MOVED target tip'] =
      shared?.status === 'fail' && shared.approxCount === 201 && shared.baseHeadCount === 200;
    checks['the branch alone is under the cap — only the projection fails it'] =
      countBudgetLines(`${bodyLines(196)}\n`) === 196;

    // The merge-queue spelling. `merge_group.base_ref` is a full ref, and
    // resolving it is the difference between this guard running in the queue
    // and skipping the one lane where the second PR's failure lands.
    const viaFullRef = evaluate({
      cwd: moved,
      baseRef: 'refs/heads/main',
      headroom: DEFAULT_HEADROOM,
    });
    checks['resolves the merge-group refs/heads/<name> spelling'] =
      viaFullRef.skippedReason === undefined &&
      viaFullRef.verdicts.find((v) => v.file === 'shared.ts')?.status === 'fail';

    // Degenerate cases: each must be a REPORT, never a quiet pass.
    const noBase = evaluate({ cwd: moved, baseRef: 'no-such-branch', headroom: DEFAULT_HEADROOM });
    checks['an unresolvable base ref is fatal, not a silent skip'] =
      noBase.fatal === true && noBase.verdicts.length === 0;

    // A path `git diff --name-only` C-quotes. Quoted, it matches neither the
    // linted-extension test nor a later `git show`, and drops out unreported.
    writeAndCommit(
      moved,
      'café-service.ts',
      `${bodyLines(260, 'c')}\n`,
      'feature: an over-budget file whose name git quotes'
    );
    // A file oxlint DOES cap despite ending in `test-utils.ts`.
    writeAndCommit(
      moved,
      'db-test-utils.ts',
      `${bodyLines(260, 'd')}\n`,
      'feature: over budget, and not the test-utils.ts oxlint exempts'
    );
    // A file oxlint never lints at all — `ignorePatterns`.
    writeAndCommit(
      moved,
      'vite.config.ts',
      `${bodyLines(260, 'v')}\n`,
      'feature: over budget but ignored by oxlint entirely'
    );

    const awkward = evaluate({ cwd: moved, baseRef: 'main', headroom: DEFAULT_HEADROOM });
    const byFile = new Map(awkward.verdicts.map((v) => [v.file, v]));
    checks['a non-ASCII path git quotes is still counted'] =
      byFile.get('café-service.ts')?.status === 'fail';
    checks['an over-budget *-test-utils.ts file is reported, not exempted'] =
      byFile.get('db-test-utils.ts')?.status === 'fail';
    checks['a file in ignorePatterns is not budgeted'] = !byFile.has('vite.config.ts');
  } finally {
    rmSync(moved, { recursive: true, force: true });
  }

  const ok = Object.values(checks).every(Boolean);
  if (ok) {
    console.log(
      `self-test OK (${Object.keys(checks).length} checks) — guard catches a branch tipped over ` +
        'the cap by a target branch that moved underneath it, resolves the merge-group ref ' +
        'spelling, reports rather than skips when it cannot answer, and does not exempt what ' +
        'oxlint caps.'
    );
  } else {
    console.error('SELF-TEST FAILED — guard did not behave as expected:');
    for (const [label, passed] of Object.entries(checks)) {
      console.error(`  ${passed ? 'OK' : 'XX'}  ${label}`);
    }
  }
  return ok;
}

/**
 * @returns {string}
 */
function tmpRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'line-budget-'));
  execFileSync('git', ['init', '--initial-branch=main', '-q'], { cwd: dir, env: gitEnv() });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, env: gitEnv() });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, env: gitEnv() });
  return dir;
}

/**
 * @param {string} dir
 * @param {string} file
 * @param {string} content
 * @param {string} message
 */
function writeAndCommit(dir, file, content, message) {
  writeFileSync(join(dir, file), content);
  execFileSync('git', ['add', file], { cwd: dir, env: gitEnv() });
  execFileSync('git', ['commit', '-q', '-m', message], { cwd: dir, env: gitEnv() });
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/ci/check-line-budget-headroom.mjs [--base <ref>] [--headroom <n>] [--self-test]\n' +
        "Projects every linted file this branch touches onto the target branch's current tip and\n" +
        'warns/fails when the projected line count approaches or crosses the oxlint max-lines cap.'
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }
  process.exit(run() ? 0 : 1);
}

if (import.meta.main) {
  main();
}
