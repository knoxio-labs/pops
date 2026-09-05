/**
 * Batch import of one Up account into the POPS account mapped to it
 * (POPS-30, ADR-052).
 *
 * The write half of {@link planUpSync}: run the new rows through the same
 * process → commit pipeline a file import uses, settle the held ones in
 * place, and mint an `import` checkpoint from the account's API balance dated
 * the day of the sync — not the newest row's date, because the balance is
 * what Up says the account holds NOW, and a range that ends last month says
 * nothing about today.
 *
 * A sync that finds nothing new still writes a batch with zero rows: for an
 * API source, "checked, nothing new" is the fact worth recording, and it is
 * what the staleness read (POPS-2917) measures cadence from.
 */
import { getAccountKindBehaviour } from '../../../contract/account-kind.js';
import {
  accountCheckpointsService,
  checkpointDelta,
  importBatchesService,
  isCheckpointConflict,
  today,
  type FinanceDb,
} from '../../../db/index.js';
import { planUpSync, type UpSyncArgs, type UpSyncPlan } from './sync-plan.js';
import { importMappedRows, settleMappedRows } from './write-rows.js';

import type { ImportWarning } from '../../../contract/rest-imports-schemas.js';
import type { ContactsClient } from '../../contacts/client.js';

export interface UpSyncCheckpoint {
  id: string;
  balanceCents: number;
  deltaCents: number;
}

export interface UpSyncResult {
  accountId: string;
  commitKey: string;
  fetched: number;
  imported: number;
  failed: number;
  settled: number;
  alreadyHeld: number;
  batchId: string | null;
  /** Null when a checkpoint for this account and day already exists. */
  checkpoint: UpSyncCheckpoint | null;
  warnings: ImportWarning[];
}

/**
 * Up's balance is signed in the customer's favour — positive is money held,
 * negative is money owed on a home loan — which is the ledger's own convention
 * for every account kind, so it is recorded as sent. The kind is read only to
 * skip an account that has no external balance to anchor on.
 */
function mintBalanceCheckpoint(
  db: FinanceDb,
  plan: UpSyncPlan,
  commitKey: string,
  asOf: string
): { checkpoint: UpSyncCheckpoint | null; warning?: ImportWarning } {
  if (!getAccountKindBehaviour(plan.account.kind).hasExternalBalance) return { checkpoint: null };
  const balanceCents = plan.upAccount.attributes.balance.valueInBaseUnits;
  let row;
  try {
    row = accountCheckpointsService.insertCheckpoint(db, {
      accountId: plan.account.id,
      balanceCents,
      asOf,
      source: 'import',
      sourceRef: commitKey,
      note: `${plan.account.name} balance from the Up API`,
    });
  } catch (error) {
    if (isCheckpointConflict(error)) return { checkpoint: null };
    throw error;
  }
  const delta = checkpointDelta(db, row);
  const deltaCents = delta?.deltaCents ?? 0;
  const checkpoint = { id: row.id, balanceCents, deltaCents };
  if (delta === null || deltaCents === 0) return { checkpoint };
  return {
    checkpoint,
    warning: {
      type: 'CHECKPOINT_MISMATCH',
      message: `Ledger disagrees with ${plan.account.name}'s Up balance`,
      affectedCount: 1,
      details: `expected ${delta.expectedBalanceCents}c, Up says ${balanceCents}c (Δ ${deltaCents}c)`,
    },
  };
}

/** Plan, then write: import, settle, batch, checkpoint. */
export async function syncUpAccount(
  db: FinanceDb,
  contacts: ContactsClient,
  args: UpSyncArgs
): Promise<UpSyncResult> {
  const plan = await planUpSync(db, args);
  const commitKey = crypto.randomUUID();

  const imported = await importMappedRows(
    db,
    contacts,
    { accountId: plan.account.id, commitKey },
    plan.newRows
  );
  const settled = settleMappedRows(db, plan.settleable);
  const minted = mintBalanceCheckpoint(db, plan, commitKey, args.asOf ?? today());
  if (minted.checkpoint !== null && imported.batchId !== null) {
    importBatchesService.attachCheckpoint(db, imported.batchId, minted.checkpoint.id);
  }

  return {
    accountId: plan.account.id,
    commitKey,
    fetched: plan.fetched,
    imported: imported.imported,
    failed: imported.failed,
    settled,
    alreadyHeld: plan.alreadyHeld,
    batchId: imported.batchId,
    checkpoint: minted.checkpoint,
    warnings: minted.warning ? [...imported.warnings, minted.warning] : imported.warnings,
  };
}
