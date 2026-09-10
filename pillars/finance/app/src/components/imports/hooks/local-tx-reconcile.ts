import type { ProcessedTransaction } from '../../../store/importStore';

export const TX_BUCKETS = ['matched', 'uncertain', 'failed', 'skipped'] as const;
export type TxBucket = (typeof TX_BUCKETS)[number];

export interface LocalTxState {
  matched: ProcessedTransaction[];
  uncertain: ProcessedTransaction[];
  failed: ProcessedTransaction[];
  skipped: ProcessedTransaction[];
}

interface ChecksumEntry {
  bucket: TxBucket;
  tx: ProcessedTransaction;
}

function indexByChecksum(state: LocalTxState): Map<string, ChecksumEntry> {
  const map = new Map<string, ChecksumEntry>();
  for (const bucket of TX_BUCKETS) {
    for (const tx of state[bucket]) map.set(tx.checksum, { bucket, tx });
  }
  return map;
}

/**
 * Move (or replace in place) the transaction identified by `checksum` into
 * `targetBucket`, dropping any prior copy from every bucket first.
 *
 * This is the canonical checksum-keyed "replace a transaction in a bucket"
 * identity (#3590/#3620): any prior copy of the checksum — including
 * duplicates that shouldn't exist but might — is removed from all buckets, so
 * the result holds exactly one copy per checksum. When the checksum was
 * already present in `targetBucket`, the replacement keeps that card's
 * original position; otherwise the new entry is appended. `build` receives
 * the prior copy of the transaction if one existed in `targetBucket`.
 */
export function replaceByChecksum(
  prev: LocalTxState,
  checksum: string,
  targetBucket: TxBucket,
  build: (priorInTarget: ProcessedTransaction | undefined) => ProcessedTransaction
): LocalTxState {
  const targetList = prev[targetBucket];
  const firstTargetIdx = targetList.findIndex((t) => t.checksum === checksum);
  const updatedTx = build(firstTargetIdx === -1 ? undefined : targetList[firstTargetIdx]);

  const next = { ...prev };
  for (const bucket of TX_BUCKETS) {
    if (bucket === targetBucket) continue;
    const list = prev[bucket];
    if (list.some((t) => t.checksum === checksum))
      next[bucket] = list.filter((t) => t.checksum !== checksum);
  }
  next[targetBucket] =
    firstTargetIdx === -1
      ? [...targetList, updatedTx]
      : targetList.filter((t) => t.checksum !== checksum).toSpliced(firstTargetIdx, 0, updatedTx);
  return next;
}

/** The bucket currently holding the transaction identified by `checksum`, if any. */
export function bucketOfChecksum(state: LocalTxState, checksum: string): TxBucket | undefined {
  return TX_BUCKETS.find((bucket) => state[bucket].some((t) => t.checksum === checksum));
}

/**
 * Structural equality over two transactions.
 *
 * By VALUE, not by reference. {@link collectChangedChecksums} used `!==`, so a
 * bulk update that rebuilt rows it did not semantically change marked them all
 * as resolved by hand — and a row in that set is pinned for the rest of the
 * session, unreachable by any rule the user writes afterwards (POPS-3121).
 * Rebuilding a row is how React state is updated; it says nothing about
 * whether anyone changed it.
 *
 * Deep rather than shallow because a rebuild routinely re-spreads `entity`,
 * `ruleProvenance` and `matchedRules` too, so a shallow check would fix the
 * reported shape and leave the same false positive one level down.
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => sameValue(item, b[i]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => key in right && sameValue(left[key], right[key]));
}

/**
 * Checksums whose transaction moved bucket or actually changed between `prev`
 * and `next`. Used to mark rows the user just resolved by hand (edit, entity
 * pick, bulk accept) so a later server reconciliation never silently reverts
 * them.
 *
 * "Actually changed" is {@link sameValue}'s question, and the distinction is
 * load-bearing: the set this feeds is permanent for the session, so a row
 * marked here by mistake is a row no later rule can reach (POPS-3121). What
 * the ticket leaves open — whether a rule authored AFTER a genuine manual
 * resolution should win, and whether the pin should be per-field — is a
 * question about deliberate edits and is untouched here. This only stops rows
 * nobody edited from being pinned at all.
 */
export function collectChangedChecksums(prev: LocalTxState, next: LocalTxState): string[] {
  const prevIndex = indexByChecksum(prev);
  const changed: string[] = [];
  for (const bucket of TX_BUCKETS) {
    for (const tx of next[bucket]) {
      const before = prevIndex.get(tx.checksum);
      if (!before || before.bucket !== bucket || !sameValue(before.tx, tx)) {
        changed.push(tx.checksum);
      }
    }
  }
  return changed;
}

/**
 * Merges a fresh server reevaluation result with the client's local state,
 * keeping the local copy of any transaction the user has already resolved by
 * hand (tracked in `resolvedChecksums`) instead of letting the server's
 * from-scratch categorization silently revert it.
 */
export function mergeReevaluatedResult<T extends LocalTxState>(
  prevLocal: LocalTxState,
  serverResult: T,
  resolvedChecksums: ReadonlySet<string>
): T {
  if (resolvedChecksums.size === 0) return serverResult;
  const prevIndex = indexByChecksum(prevLocal);
  const merged = {
    ...serverResult,
    matched: serverResult.matched.filter((tx) => !resolvedChecksums.has(tx.checksum)),
    uncertain: serverResult.uncertain.filter((tx) => !resolvedChecksums.has(tx.checksum)),
    failed: serverResult.failed.filter((tx) => !resolvedChecksums.has(tx.checksum)),
    skipped: serverResult.skipped.filter((tx) => !resolvedChecksums.has(tx.checksum)),
  };
  for (const checksum of resolvedChecksums) {
    const entry = prevIndex.get(checksum);
    if (entry) merged[entry.bucket] = [...merged[entry.bucket], entry.tx];
  }
  return merged;
}
