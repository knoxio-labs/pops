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
  importsService,
  isCheckpointConflict,
  today,
  type FinanceDb,
} from '../../../db/index.js';
import { commitImport } from '../imports/commit.js';
import { processImportCore } from '../imports/process-service.js';
import { UP_MAPPER_VERSION, UP_SOURCE_REF, type MappedUpTransaction } from './map-transaction.js';
import { planUpSync, type UpSyncArgs, type UpSyncPlan } from './sync-plan.js';

import type {
  ConfirmedTransaction,
  ImportWarning,
} from '../../../contract/rest-imports-schemas.js';
import type { ContactsClient } from '../../contacts/client.js';
import type { ProcessedTransaction } from '../imports/types.js';

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

interface ImportedRows {
  imported: number;
  failed: number;
  batchId: string | null;
  warnings: ImportWarning[];
}

/**
 * Unattended confirmation: a matched row keeps the entity and tags the
 * pipeline gave it; anything less certain is imported bare and left for
 * review. The mapper's own type wins over the ladder's where it asserted one,
 * because Up knows a transfer is a transfer.
 */
function confirmUnattended(
  processed: ProcessedTransaction,
  mappedType: Map<string, MappedUpTransaction['transactionType']>
): ConfirmedTransaction {
  const { entity, status, skipReason, error, ruleProvenance, matchedRules, ...parsed } = processed;
  const confident = status === 'matched';
  return {
    ...parsed,
    transactionType: mappedType.get(processed.checksum) ?? processed.transactionType,
    entityId: confident ? entity.entityId : undefined,
    entityName: confident ? entity.entityName : undefined,
    tags: confident ? (processed.suggestedTags ?? []).map((s) => s.tag) : [],
    matchType: confident ? entity.matchType : undefined,
    matchRuleId: confident ? ruleProvenance?.ruleId : undefined,
    matchConfidence: confident ? entity.confidence : undefined,
  };
}

async function importNewRows(
  db: FinanceDb,
  contacts: ContactsClient,
  plan: UpSyncPlan,
  commitKey: string
): Promise<ImportedRows> {
  if (plan.newRows.length === 0) {
    const batch = importBatchesService.insertBatch(
      db,
      {
        accountId: plan.account.id,
        sourceKind: 'api',
        sourceRef: UP_SOURCE_REF,
        parserVersion: UP_MAPPER_VERSION,
        commitKey,
        rowCount: 0,
      },
      []
    );
    return { imported: 0, failed: 0, batchId: batch.id, warnings: [] };
  }

  const mappedType = new Map(plan.newRows.map((row) => [row.parsed.checksum, row.transactionType]));
  const { output } = await processImportCore({
    db,
    contacts,
    transactions: plan.newRows.map((row) => row.parsed),
    importBatchId: commitKey,
  });
  const transactions = [...output.matched, ...output.uncertain, ...output.failed].map((row) =>
    confirmUnattended(row, mappedType)
  );
  const result = await commitImport(db, contacts, {
    entities: [],
    changeSets: [],
    tagRuleChangeSets: [],
    transactions,
    commitKey,
    source: { kind: 'api', provider: 'up', parserVersion: UP_MAPPER_VERSION },
  });
  return {
    imported: result.transactionsImported,
    failed: result.transactionsFailed,
    batchId: result.batches?.find((b) => b.accountId === plan.account.id)?.id ?? null,
    warnings: result.warnings ?? [],
  };
}

function settleRows(db: FinanceDb, plan: UpSyncPlan): number {
  for (const { transactionId, mapped } of plan.settleable) {
    importsService.settleImportedTransaction(db, transactionId, {
      date: mapped.parsed.date,
      amountCents: Math.round(mapped.parsed.amount * 100),
      rawRow: mapped.parsed.rawRow,
    });
  }
  return plan.settleable.length;
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

  const imported = await importNewRows(db, contacts, plan, commitKey);
  const settled = settleRows(db, plan);
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
