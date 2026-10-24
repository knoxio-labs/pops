import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

export const SLOT_PREFIX = 'pops-slot-';
export const DEFAULT_MAX_SLOTS = 6;
export const DEFAULT_LEASE_GRACE_MS = 30 * 60 * 1000;

const LEASE_FILE = 'pops-slot-lease.json';
const LOCK_ORPHAN_MS = 10_000;
const LOCK_DIR = '.pops-slots.lock';
const SLOT_NAME = new RegExp(`^${SLOT_PREFIX}(\\d+)$`);

/**
 * @typedef {{
 *   path: string,
 *   head: string | null,
 *   branch: string | null,
 *   detached: boolean,
 *   bare: boolean,
 *   locked: boolean,
 *   prunable: string | null,
 * }} WorktreeEntry
 */

/** @typedef {{ branch: string, pid: number, acquiredAt: string }} Lease */

/** @typedef {'free' | 'busy' | 'reclaimable' | 'dirty'} SlotState */

/**
 * @typedef {{
 *   name: string,
 *   index: number,
 *   path: string,
 *   branch: string | null,
 *   state: SlotState,
 *   lease: Lease | null,
 *   dirty: boolean,
 * }} Slot
 */

/**
 * Parses `git worktree list --porcelain` output.
 * @param {string} text
 * @returns {WorktreeEntry[]}
 */
export function parseWorktreeList(text) {
  /** @type {WorktreeEntry[]} */
  const entries = [];
  for (const block of text.split(/\n\s*\n/)) {
    /** @type {WorktreeEntry | null} */
    let entry = null;
    for (const line of block.split('\n')) {
      if (line.trim() === '') continue;
      const space = line.indexOf(' ');
      const key = space === -1 ? line : line.slice(0, space);
      const value = space === -1 ? '' : line.slice(space + 1);
      if (key === 'worktree') {
        entry = {
          path: value,
          head: null,
          branch: null,
          detached: false,
          bare: false,
          locked: false,
          prunable: null,
        };
        entries.push(entry);
      } else if (entry !== null) {
        if (key === 'HEAD') entry.head = value;
        else if (key === 'branch') entry.branch = value.replace(/^refs\/heads\//, '');
        else if (key === 'detached') entry.detached = true;
        else if (key === 'bare') entry.bare = true;
        else if (key === 'locked') entry.locked = true;
        else if (key === 'prunable') entry.prunable = value;
      }
    }
  }
  return entries;
}

/**
 * Validates untrusted lease JSON; returns null for anything malformed.
 * @param {string} text
 * @returns {Lease | null}
 */
export function parseLease(text) {
  try {
    const value = JSON.parse(text);
    if (
      typeof value === 'object' &&
      value !== null &&
      typeof value.branch === 'string' &&
      Number.isInteger(value.pid) &&
      typeof value.acquiredAt === 'string' &&
      !Number.isNaN(Date.parse(value.acquiredAt))
    ) {
      return { branch: value.branch, pid: value.pid, acquiredAt: value.acquiredAt };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * A slot is acquirable only when it is clean and no live holder (or a holder
 * still inside the grace window) claims it. A dirty slot is never acquirable.
 * @param {{ lease: Lease | null, dirty: boolean, pidAlive: boolean, leaseAgeMs: number, graceMs: number }} input
 * @returns {SlotState}
 */
export function classifySlot({ lease, dirty, pidAlive, leaseAgeMs, graceMs }) {
  if (lease !== null && pidAlive) return 'busy';
  if (dirty) return 'dirty';
  if (lease === null) return 'free';
  return leaseAgeMs < graceMs ? 'busy' : 'reclaimable';
}

/**
 * @param {string} path
 * @returns {number | null} slot index, or null when the directory is not a slot name
 */
export function slotIndex(path) {
  const match = SLOT_NAME.exec(basename(path));
  return match === null ? null : Number(match[1]);
}

/**
 * Picks what `acquire` should do. Prefers a slot already on the requested
 * branch, then free slots (lowest index), then reclaimable ones, then a new
 * slot while below the cap.
 * @param {{ slots: readonly Slot[], branch: string, maxSlots: number, takenIndexes?: readonly number[] }} input
 * @returns {{ action: 'reuse', slot: Slot } | { action: 'create', index: number } | { action: 'fail', reason: string }}
 */
export function selectSlot({ slots, branch, maxSlots, takenIndexes = [] }) {
  const sorted = slots.toSorted((a, b) => a.index - b.index);
  const holder = sorted.find((slot) => slot.branch === branch);
  if (holder !== undefined) {
    if (holder.state === 'free' || holder.state === 'reclaimable') {
      return { action: 'reuse', slot: holder };
    }
    return {
      action: 'fail',
      reason: `Branch ${branch} is checked out in ${holder.name} (${holder.state}).`,
    };
  }
  const free = sorted.find((slot) => slot.state === 'free');
  if (free !== undefined) return { action: 'reuse', slot: free };
  const reclaimable = sorted.find((slot) => slot.state === 'reclaimable');
  if (reclaimable !== undefined) return { action: 'reuse', slot: reclaimable };
  if (sorted.length < maxSlots) {
    const used = new Set([...sorted.map((slot) => slot.index), ...takenIndexes]);
    let index = 1;
    while (used.has(index)) index += 1;
    return { action: 'create', index };
  }
  const unavailable = sorted.map(
    (slot) => `  ${slot.name}: ${slot.state} (${slot.branch ?? 'detached'})`
  );
  return {
    action: 'fail',
    reason: `No free slot and the pool is at its cap of ${maxSlots}:\n${unavailable.join('\n')}`,
  };
}

/**
 * @typedef {{
 *   name: string,
 *   reason: 'merged' | 'gone' | 'merged+gone',
 *   action: 'delete' | 'delete-with-include-gone' | 'skip',
 *   skip?: string,
 * }} BranchPlan
 */

/**
 * Classifies what `gc` may remove. Nothing here touches git; callers decide
 * whether to apply it. A branch checked out in any live worktree is never
 * deletable, and a branch whose only evidence is a vanished upstream needs an
 * explicit opt-in because a closed (unmerged) PR looks the same.
 * @param {{
 *   worktrees: readonly WorktreeEntry[],
 *   branches: readonly { name: string, upstreamGone: boolean }[],
 *   mergedBranches: readonly string[],
 *   protectedBranches?: readonly string[],
 * }} input
 * @returns {{ prunable: WorktreeEntry[], branches: BranchPlan[] }}
 */
export function planGc({ worktrees, branches, mergedBranches, protectedBranches = ['main'] }) {
  const prunable = worktrees.filter((entry) => entry.prunable !== null && !entry.locked);
  const checkedOut = new Map();
  for (const entry of worktrees) {
    if (entry.branch !== null && !prunable.includes(entry))
      checkedOut.set(entry.branch, entry.path);
  }
  const merged = new Set(mergedBranches);
  /** @type {BranchPlan[]} */
  const plans = [];
  for (const { name, upstreamGone } of branches) {
    if (protectedBranches.includes(name)) continue;
    const isMerged = merged.has(name);
    if (!isMerged && !upstreamGone) continue;
    /** @type {BranchPlan['reason']} */
    let reason = 'gone';
    if (isMerged) reason = upstreamGone ? 'merged+gone' : 'merged';
    const location = checkedOut.get(name);
    if (location !== undefined) {
      plans.push({ name, reason, action: 'skip', skip: `checked out at ${location}` });
    } else {
      plans.push({ name, reason, action: isMerged ? 'delete' : 'delete-with-include-gone' });
    }
  }
  return { prunable, branches: plans };
}

/**
 * @param {number} kibibytes
 * @returns {string}
 */
export function formatSize(kibibytes) {
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let value = kibibytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/**
 * @param {number} pid
 * @returns {boolean}
 */
export function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
}

/**
 * @param {string | undefined} raw
 * @param {number} fallback
 * @param {string} label
 * @param {number} minimum
 * @returns {number}
 */
function parseIntegerSetting(raw, fallback, label, minimum) {
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}, got "${raw}".`);
  }
  return value;
}

/**
 * @param {string} cwd
 * @param {readonly string[]} args
 * @returns {string}
 */
function git(cwd, args) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    }).trim();
  } catch (error) {
    const stderr =
      error instanceof Error && 'stderr' in error ? String(error.stderr).trim() : String(error);
    throw new Error(`git ${args.join(' ')} failed: ${stderr}`, { cause: error });
  }
}

/**
 * @param {string} cwd
 * @param {readonly string[]} args
 * @returns {boolean}
 */
function gitSucceeds(cwd, args) {
  try {
    git(cwd, args);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} path
 * @returns {boolean}
 */
function isDirty(path) {
  if (git(path, ['status', '--porcelain']) !== '') return true;
  const gitDir = git(path, ['rev-parse', '--absolute-git-dir']);
  return ['rebase-merge', 'rebase-apply', 'MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD'].some(
    (marker) => existsSync(join(gitDir, marker))
  );
}

/**
 * @param {string} path
 * @returns {string}
 */
function leasePath(path) {
  return join(git(path, ['rev-parse', '--absolute-git-dir']), LEASE_FILE);
}

/**
 * @param {string} path
 * @returns {Lease | null}
 */
function readLease(path) {
  const file = leasePath(path);
  return existsSync(file) ? parseLease(readFileSync(file, 'utf8')) : null;
}

/**
 * @typedef {{
 *   cwd: string,
 *   env: NodeJS.ProcessEnv,
 *   now?: () => number,
 *   pidAlive?: (pid: number) => boolean,
 *   log?: (message: string) => void,
 *   out?: (message: string) => void,
 * }} Context
 */

/**
 * @param {Context} context
 */
function poolConfig(context) {
  const worktrees = parseWorktreeList(git(context.cwd, ['worktree', 'list', '--porcelain']));
  const mainPath = worktrees[0]?.path ?? context.cwd;
  const configured = context.env.POPS_WORKTREE_ROOT;
  const root = resolve(
    configured !== undefined && configured !== '' ? configured : dirname(mainPath)
  );
  return {
    worktrees,
    mainPath,
    root,
    maxSlots: parseIntegerSetting(
      context.env.POPS_WORKTREE_MAX_SLOTS,
      DEFAULT_MAX_SLOTS,
      'POPS_WORKTREE_MAX_SLOTS',
      1
    ),
    graceMs: parseIntegerSetting(
      context.env.POPS_WORKTREE_LEASE_GRACE_MS,
      DEFAULT_LEASE_GRACE_MS,
      'POPS_WORKTREE_LEASE_GRACE_MS',
      0
    ),
  };
}

/**
 * @param {Context} context
 * @param {ReturnType<typeof poolConfig>} config
 * @returns {{ slots: Slot[], takenIndexes: number[] }}
 */
function readSlots(context, config) {
  const now = context.now ?? Date.now;
  const alive = context.pidAlive ?? isPidAlive;
  const root = existsSync(config.root) ? realpathSync(config.root) : config.root;
  /** @type {Slot[]} */
  const slots = [];
  /** @type {number[]} */
  const takenIndexes = [];
  for (const entry of config.worktrees) {
    const index = slotIndex(entry.path);
    if (index === null || dirname(entry.path) !== root) continue;
    takenIndexes.push(index);
    if (entry.prunable !== null || !existsSync(entry.path)) continue;
    const lease = readLease(entry.path);
    const dirty = isDirty(entry.path);
    const state = classifySlot({
      lease,
      dirty,
      pidAlive: lease !== null && alive(lease.pid),
      leaseAgeMs: lease === null ? 0 : now() - Date.parse(lease.acquiredAt),
      graceMs: config.graceMs,
    });
    slots.push({
      name: basename(entry.path),
      index,
      path: entry.path,
      branch: entry.branch,
      state,
      lease,
      dirty,
    });
  }
  return { slots, takenIndexes };
}

/**
 * @param {string} root
 * @param {() => void} action
 */
function withPoolLock(root, action) {
  const lock = join(root, LOCK_DIR);
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
      const holderFile = join(lock, 'pid');
      const holder = existsSync(holderFile) ? Number(readFileSync(holderFile, 'utf8')) : 0;
      const abandoned =
        holder > 0 ? !isPidAlive(holder) : Date.now() - statSync(lock).mtimeMs > LOCK_ORPHAN_MS;
      if (abandoned) {
        rmSync(lock, { recursive: true, force: true });
        continue;
      }
      if (Date.now() > deadline)
        throw new Error(`Timed out waiting for pool lock ${lock}.`, { cause: error });
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
  try {
    writeFileSync(join(lock, 'pid'), String(process.pid));
    action();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

/**
 * @param {readonly string[]} args
 * @param {string} flag
 * @returns {string | undefined}
 */
function flagValue(args, flag) {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
}

/**
 * Leases a warm worktree slot for `branch` and returns its path. The branch is
 * created from `origin/main` unless it already exists locally or on origin.
 * Ignored build state (target/, node_modules/) is left in place.
 * @param {Context} context
 * @param {readonly string[]} args `<branch> [--install-deps] [--pid N]`
 * @returns {string} absolute slot path
 */
export function acquire(context, args) {
  const branch = args.find((arg, at) => !arg.startsWith('--') && args[at - 1] !== '--pid');
  if (branch === undefined || branch.includes('..') || branch.startsWith('/')) {
    throw new Error('acquire needs a relative <branch> name.');
  }
  git(context.cwd, ['check-ref-format', '--branch', branch]);
  const holderPid = Number(
    flagValue(args, '--pid') ?? context.env.POPS_WORKTREE_HOLDER_PID ?? process.ppid
  );
  if (!Number.isInteger(holderPid) || holderPid <= 0)
    throw new Error('Holder pid must be a positive integer.');
  const log = context.log ?? (() => {});
  const now = context.now ?? Date.now;

  git(context.cwd, ['fetch', 'origin', 'main']);
  const config = poolConfig(context);
  mkdirSync(config.root, { recursive: true });
  const root = realpathSync(config.root);
  const elsewhere = config.worktrees.find(
    (entry) => entry.branch === branch && entry.prunable === null && slotIndex(entry.path) === null
  );
  if (elsewhere !== undefined) {
    throw new Error(`Branch ${branch} is already checked out at ${elsewhere.path}.`);
  }

  /** @type {string} */
  let slotPath = '';
  withPoolLock(root, () => {
    const pool = poolConfig(context);
    const { slots, takenIndexes } = readSlots(context, { ...pool, root });
    const choice = selectSlot({ slots, branch, maxSlots: pool.maxSlots, takenIndexes });
    if (choice.action === 'fail') throw new Error(choice.reason);

    const hasLocal = gitSucceeds(context.cwd, [
      'show-ref',
      '--verify',
      '--quiet',
      `refs/heads/${branch}`,
    ]);
    const hasRemote = gitSucceeds(context.cwd, [
      'show-ref',
      '--verify',
      '--quiet',
      `refs/remotes/origin/${branch}`,
    ]);
    if (choice.action === 'create') {
      slotPath = join(root, `${SLOT_PREFIX}${choice.index}`);
      git(context.cwd, ['worktree', 'add', '--detach', slotPath, 'origin/main']);
      log(`created ${slotPath}`);
    } else {
      slotPath = choice.slot.path;
      if (isDirty(slotPath)) throw new Error(`${slotPath} became dirty; refusing to switch it.`);
      log(`reusing ${slotPath} (was ${choice.slot.state})`);
    }
    if (hasLocal) git(slotPath, ['switch', branch]);
    else if (hasRemote) git(slotPath, ['switch', '-c', branch, '--track', `origin/${branch}`]);
    else git(slotPath, ['switch', '-c', branch, '--no-track', 'origin/main']);

    /** @type {Lease} */
    const lease = { branch, pid: holderPid, acquiredAt: new Date(now()).toISOString() };
    writeFileSync(leasePath(slotPath), `${JSON.stringify(lease)}\n`);
  });

  if (args.includes('--install-deps')) {
    execFileSync('pnpm', ['install'], { cwd: slotPath, stdio: ['ignore', 2, 2] });
  }
  return slotPath;
}

/**
 * Marks a slot free: requires it clean, detaches HEAD at origin/main so the
 * branch can be deleted, and drops the lease. Never deletes the branch.
 * @param {Context} context
 * @param {readonly string[]} args `<slot-name|index|path|branch>`
 * @returns {string} released slot path
 */
export function release(context, args) {
  const target = args[0];
  if (target === undefined) throw new Error('release needs a <slot|branch> argument.');
  const config = poolConfig(context);
  const { slots } = readSlots(context, config);
  const slot = slots.find(
    (candidate) =>
      candidate.name === target ||
      candidate.name === `${SLOT_PREFIX}${target}` ||
      candidate.path === resolve(target) ||
      candidate.lease?.branch === target ||
      candidate.branch === target
  );
  if (slot === undefined) throw new Error(`No slot matches "${target}".`);
  if (slot.dirty) {
    throw new Error(
      `${slot.name} has uncommitted or untracked changes; commit or discard them first.`
    );
  }
  const base = gitSucceeds(slot.path, ['rev-parse', '--verify', '--quiet', 'origin/main'])
    ? 'origin/main'
    : 'HEAD';
  git(slot.path, ['switch', '--detach', base]);
  rmSync(leasePath(slot.path), { force: true });
  return slot.path;
}

/**
 * @param {string} path
 * @returns {string}
 */
function targetSize(path) {
  const target = join(path, 'target');
  if (!existsSync(target)) return '-';
  try {
    const [kibibytes] = execFileSync('du', ['-sk', target], { encoding: 'utf8' }).split('\t');
    return formatSize(Number(kibibytes));
  } catch {
    return '?';
  }
}

/**
 * Renders the pool as a table.
 * @param {Context} context
 * @returns {string}
 */
export function status(context) {
  const config = poolConfig(context);
  const { slots } = readSlots(context, config);
  if (slots.length === 0) return `No slots under ${config.root} (cap ${config.maxSlots}).`;
  const rows = slots
    .toSorted((a, b) => a.index - b.index)
    .map((slot) =>
      [
        slot.name,
        slot.state,
        slot.dirty ? 'dirty' : 'clean',
        slot.branch ?? '(detached)',
        targetSize(slot.path),
        slot.lease === null ? '-' : `pid ${slot.lease.pid} since ${slot.lease.acquiredAt}`,
      ].join('\t')
    );
  return [
    `slots under ${config.root} (cap ${config.maxSlots})`,
    'slot\tstate\ttree\tbranch\ttarget/\tlease',
    ...rows,
  ].join('\n');
}

/**
 * Reports, and with `--apply` performs, worktree pruning and branch cleanup.
 * Dry-run is the default.
 * @param {Context} context
 * @param {readonly string[]} args `[--dry-run | --apply] [--include-gone]`
 * @returns {{ report: string, counts: Record<string, number> }}
 */
export function gc(context, args) {
  const apply = args.includes('--apply');
  if (apply && args.includes('--dry-run'))
    throw new Error('Pass either --dry-run or --apply, not both.');
  const includeGone = args.includes('--include-gone');
  const worktrees = parseWorktreeList(git(context.cwd, ['worktree', 'list', '--porcelain']));
  const branches = git(context.cwd, [
    'for-each-ref',
    '--format=%(refname:short)%09%(upstream:track)',
    'refs/heads',
  ])
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const [name = '', track = ''] = line.split('\t');
      return { name, upstreamGone: track.includes('gone') };
    });
  const mergedBranches = git(context.cwd, [
    'for-each-ref',
    '--merged',
    'origin/main',
    '--format=%(refname:short)',
    'refs/heads',
  ])
    .split('\n')
    .filter((line) => line !== '');
  const plan = planGc({ worktrees, branches, mergedBranches });
  const deletable = plan.branches.filter(
    (branch) =>
      branch.action === 'delete' || (branch.action === 'delete-with-include-gone' && includeGone)
  );
  const needsOptIn = plan.branches.filter(
    (b) => b.action === 'delete-with-include-gone' && !includeGone
  );
  const skipped = plan.branches.filter((branch) => branch.action === 'skip');
  const counts = {
    prunableWorktrees: plan.prunable.length,
    candidateBranches: plan.branches.length,
    deletableBranches: deletable.length,
    goneOnlyNeedingIncludeGone: needsOptIn.length,
    skippedCheckedOut: skipped.length,
  };
  const lines = [apply ? 'gc: APPLY' : 'gc: dry-run (nothing is deleted)'];
  for (const entry of plan.prunable) lines.push(`prune worktree ${entry.path} (${entry.prunable})`);
  for (const branch of deletable) lines.push(`delete branch ${branch.name} (${branch.reason})`);
  for (const branch of needsOptIn) lines.push(`needs --include-gone: ${branch.name} (gone)`);
  for (const branch of skipped)
    lines.push(`skip ${branch.name} (${branch.reason}): ${branch.skip}`);
  lines.push(...Object.entries(counts).map(([key, value]) => `${key}: ${value}`));
  if (apply) {
    if (plan.prunable.length > 0) git(context.cwd, ['worktree', 'prune']);
    for (const branch of deletable) git(context.cwd, ['branch', '-D', branch.name]);
  }
  return { report: lines.join('\n'), counts };
}

/**
 * Entry point for the slot verbs (`acquire`, `release`, `status`, `gc`, `hook`).
 * @param {string} operation
 * @param {readonly string[]} args
 * @param {Context} context
 * @param {string} [stdin] raw hook JSON for `hook`
 * @returns {string} text for stdout
 */
export function runSlotCommand(operation, args, context, stdin = '') {
  const log = context.log ?? ((message) => console.error(message));
  const withLog = { ...context, log };
  switch (operation) {
    case 'acquire':
      return acquire(withLog, args);
    case 'release':
      return release(withLog, args);
    case 'status':
      return status(withLog);
    case 'gc':
      return gc(withLog, args).report;
    case 'hook': {
      const payload = JSON.parse(stdin);
      if (args[0] === 'create') {
        if (typeof payload.name !== 'string')
          throw new Error('WorktreeCreate payload has no name.');
        return acquire(withLog, [`worktree-${payload.name}`]);
      }
      if (args[0] === 'remove') {
        if (typeof payload.worktree_path !== 'string') {
          throw new Error('WorktreeRemove payload has no worktree_path.');
        }
        return release(withLog, [payload.worktree_path]);
      }
      throw new Error('hook needs create or remove.');
    }
    default:
      throw new Error(`Unknown operation ${operation}.`);
  }
}
