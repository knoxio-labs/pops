/**
 * What a commit does when it finishes a draft the bank filled (finance
 * ADR-005, POPS-3335): the balance the provider reported with the newest
 * row becomes an `import` checkpoint dated to that row, and the batch is
 * recorded as the provider's rather than a file's. Both happen inside the
 * commit's own transaction, so a rejected commit leaves the draft, the
 * checkpoint and the batch alike untouched.
 */
import { importDraftsService, type FinanceDb } from '../../../db/index.js';
import { UP_MAPPER_VERSION } from '../up-bank/map-transaction.js';
import { mintReportedBalanceCheckpoint } from './commit-checkpoint.js';

import type { ImportSource } from '../../../contract/import-source.js';
import type { ImportWarning } from '../../../contract/rest-imports-schemas.js';
import type { CommitCheckpoint } from './types.js';

export interface LiveDraftContext {
  accountId: string;
  balanceReportedCents: number | null;
}

export function liveDraftOf(
  db: FinanceDb,
  draftId: string | undefined
): LiveDraftContext | undefined {
  if (draftId === undefined) return undefined;
  const draft = importDraftsService.getImportDraft(db, draftId);
  if (draft === undefined || draft.sourceKind !== 'live') return undefined;
  return { accountId: draft.accountId, balanceReportedCents: draft.balanceReportedCents };
}

function newestDateFor(inserted: readonly InsertedRow[], accountId: string): string | undefined {
  return inserted
    .filter((row) => row.accountId === accountId)
    .map((row) => row.date)
    .toSorted()
    .at(-1);
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
  if (liveDraft?.balanceReportedCents == null) return;
  const asOf = newestDateFor(args.inserted, liveDraft.accountId);
  if (asOf === undefined) return;
  const minted = mintReportedBalanceCheckpoint(
    tx,
    { accountId: liveDraft.accountId, balanceCents: liveDraft.balanceReportedCents, asOf },
    args.commitKey
  );
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
