/**
 * Deleting the receipts nobody kept.
 *
 * The retention window is 48 hours: long enough that a receipt read at the
 * start of a slow, distracted review is still there hours later, short
 * enough that a deliberately discarded photo does not become a permanent
 * record. Discard and Cancel do NOT delete anything immediately — only this
 * periodic sweep does, because immediate deletion needs a mobile write
 * capability the phone does not have today (POPS-3757), while the sweep
 * needs nothing from the phone and covers "the app was killed mid-flow" the
 * same way it covers a deliberate discard.
 */
import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import { isReceiptReferenced } from '../../db/services/receipt-references.js';
import { isReceiptSha256, resolveReceiptStoreRoot } from './store.js';

import type { PurchasesDb } from '../../db/services/internal.js';

/** Minimum age of an unreferenced receipt before deletion. */
export const DEFAULT_RECEIPT_RETENTION_MS = 48 * 60 * 60 * 1000;

/** Optional store root, retention age and clock for one sweep. */
export interface SweepUnreferencedReceiptsOptions {
  readonly root?: string;
  readonly retentionMs?: number;
  readonly now?: () => Date;
}

/** Counts of valid candidates, deletions, retained files and malformed names. */
export interface SweepUnreferencedReceiptsResult {
  readonly scanned: number;
  readonly deleted: number;
  readonly kept: number;
  readonly malformed: number;
}

function filenameToSha(filename: string): string | null {
  const dot = filename.lastIndexOf('.');
  if (dot === -1) return null;
  return filename.slice(0, dot);
}

type FileOutcome = 'deleted' | 'kept' | 'malformed';

interface DecideFileInput {
  readonly db: PurchasesDb;
  readonly candidateSha: string | null;
  readonly filePath: string;
  readonly retentionMs: number;
  readonly now: Date;
}

/** What happens to one candidate file, without touching the disk yet. */
function decideFile(input: DecideFileInput): FileOutcome {
  const { db, candidateSha, filePath, retentionMs, now } = input;
  if (candidateSha === null || !isReceiptSha256(candidateSha)) return 'malformed';
  if (now.getTime() - statSync(filePath).mtimeMs < retentionMs) return 'kept';
  return isReceiptReferenced(db, candidateSha) ? 'kept' : 'deleted';
}

/**
 * Delete every stored receipt older than the retention window that no
 * purchase references.
 *
 * A fresh pillar with no receipts yet — or a store root moved somewhere the
 * sweep has never scanned before — must not throw ENOENT, so a missing root
 * is a silent no-op rather than a failure.
 */
export function sweepUnreferencedReceipts(
  db: PurchasesDb,
  options: SweepUnreferencedReceiptsOptions = {}
): SweepUnreferencedReceiptsResult {
  const root = options.root ?? resolveReceiptStoreRoot();
  const retentionMs = options.retentionMs ?? DEFAULT_RECEIPT_RETENTION_MS;
  const now = (options.now ?? ((): Date => new Date()))();

  const counts = { scanned: 0, deleted: 0, kept: 0, malformed: 0 };
  if (!existsSync(root)) return counts;

  for (const shard of readdirSync(root)) {
    const shardDir = join(root, shard);
    if (!statSync(shardDir).isDirectory()) continue;

    for (const filename of readdirSync(shardDir)) {
      const candidateSha = filenameToSha(filename);
      const filePath = join(shardDir, filename);
      const outcome = decideFile({ db, candidateSha, filePath, retentionMs, now });

      if (outcome === 'malformed') {
        counts.malformed++;
        continue;
      }

      counts.scanned++;
      if (outcome === 'kept') {
        counts.kept++;
        continue;
      }

      unlinkSync(filePath);
      counts.deleted++;
    }
  }

  return counts;
}
