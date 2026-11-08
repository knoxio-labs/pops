/**
 * What a commit does when it finishes a draft the bank filled (finance
 * ADR-005, POPS-3335): the balance the provider reported becomes an
 * `import` checkpoint, and the batch is recorded as the provider's rather
 * than a file's. Both happen inside the commit's own transaction, so a
 * rejected commit leaves the draft, the checkpoint and the batch alike
 * untouched.
 *
 * A checkpoint is a day's closing balance, and the reported balance is what
 * the account held at one instant. The last day fully over at that instant
 * is the one before the reading's, so that is the day the checkpoint is
 * dated to, at the reading less every ledger row dated the reading's own
 * day. Dating it to the newest row instead recorded a mid-afternoon reading
 * as that day's close, and every later checkpoint disagreed with it by the
 * rows that followed.
 */
import {
  dayBefore,
  hasTransactionAfter,
  importDraftsService,
  sumThrough,
  type FinanceDb,
} from '../../../db/index.js';
import { UP_MAPPER_VERSION } from '../up-bank/map-transaction.js';
import { mintReportedBalanceCheckpoint } from './commit-checkpoint.js';

import type { ImportSource } from '../../../contract/import-source.js';
import type { ImportWarning } from '../../../contract/rest-imports-schemas.js';
import type { CommitCheckpoint } from './types.js';

export interface LiveDraftContext {
  accountId: string;
  balanceReportedCents: number | null;
  balanceReportedAt: string | null;
}

export function liveDraftOf(
  db: FinanceDb,
  draftId: string | undefined
): LiveDraftContext | undefined {
  if (draftId === undefined) return undefined;
  const draft = importDraftsService.getImportDraft(db, draftId);
  if (draft === undefined || draft.sourceKind !== 'live') return undefined;
  return {
    accountId: draft.accountId,
    balanceReportedCents: draft.balanceReportedCents,
    balanceReportedAt: draft.balanceReportedAt,
  };
}

/**
 * The close of the last day over when the balance was read, or undefined
 * when the ledger already holds a row dated after the reading's day: the
 * reading predates it and says nothing about any close.
 *
 * Also undefined within an hour of local midnight. The reading's offset is
 * borrowed from an Up stamp that can predate a daylight-saving change, so
 * it can be an hour out, and that near midnight is a different day.
 */
export function closeBeforeReading(
  tx: FinanceDb,
  accountId: string,
  reading: { cents: number; reportedAt: string }
): { asOf: string; balanceCents: number } | undefined {
  const readOn = reading.reportedAt.slice(0, 10);
  const timeOfDay = reading.reportedAt.slice(11, 16);
  if (timeOfDay < '01:00' || timeOfDay >= '23:00') return undefined;
  if (hasTransactionAfter(tx, accountId, readOn)) return undefined;
  const asOf = dayBefore(readOn);
  const readDayCents = sumThrough(tx, accountId, readOn) - sumThrough(tx, accountId, asOf);
  return { asOf, balanceCents: reading.cents - readDayCents };
}

interface InsertedRow {
  accountId: string;
  date: string;
}

export interface LiveDraftCommitArgs {
  liveDraft: LiveDraftContext | undefined;
  inserted: readonly InsertedRow[];
  commitKey: string | undefined;
  checkpoints: CommitCheckpoint[];
  warnings: ImportWarning[];
}

/** Mint the reported balance for a live draft, appending to the commit's own lists. */
export function commitLiveDraftPhase(tx: FinanceDb, args: LiveDraftCommitArgs): void {
  const { liveDraft } = args;
  if (liveDraft?.balanceReportedCents == null || liveDraft.balanceReportedAt === null) return;
  const accountId = liveDraft.accountId;
  if (!args.inserted.some((row) => row.accountId === accountId)) return;
  const close = closeBeforeReading(tx, accountId, {
    cents: liveDraft.balanceReportedCents,
    reportedAt: liveDraft.balanceReportedAt,
  });
  if (close === undefined) return;
  const minted = mintReportedBalanceCheckpoint(tx, { accountId, ...close }, args.commitKey);
  if (minted === undefined) return;
  args.checkpoints.push(minted.checkpoint);
  if (minted.warning) args.warnings.push(minted.warning);
}

/**
 * The batch source a commit records, per account.
 *
 * The provider's source belongs to the account the draft feeds and to no
 * other: a row can be moved to a different account during Review, and
 * stamping that account's batch as Up-fed would make `importStatus` report
 * it as fed by a provider, which in turn hides the file-upload step from
 * its next import. Every other account keeps whatever the payload said.
 */
export function batchSourceFor(
  liveDraft: LiveDraftContext | undefined,
  payloadSource: ImportSource | undefined
): (accountId: string) => ImportSource | undefined {
  return (accountId) =>
    liveDraft !== undefined && accountId === liveDraft.accountId
      ? { kind: 'api', provider: 'up', parserVersion: UP_MAPPER_VERSION }
      : payloadSource;
}
