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
 * Checksums whose transaction moved bucket or was replaced by a new object
 * between `prev` and `next`. Used to mark rows the user just resolved by hand
 * (edit, entity pick, bulk accept) so a later server reconciliation never
 * silently reverts them.
 */
export function collectChangedChecksums(prev: LocalTxState, next: LocalTxState): string[] {
  const prevIndex = indexByChecksum(prev);
  const changed: string[] = [];
  for (const bucket of TX_BUCKETS) {
    for (const tx of next[bucket]) {
      const before = prevIndex.get(tx.checksum);
      if (!before || before.bucket !== bucket || before.tx !== tx) changed.push(tx.checksum);
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
