/**
 * The write half shared by the batch sync (POPS-30) and the webhook ingest
 * (POPS-2920): new rows go through the unattended commit pipeline, held rows
 * Up has since settled are updated in place. Both callers dedupe on the same
 * checksum before getting here, so a row that reaches `importMappedRows` is
 * one the ledger does not have.
 */
import { importBatchesService, importsService, type FinanceDb } from '../../../db/index.js';
import { commitImport } from '../imports/commit.js';
import { processImportCore } from '../imports/process-service.js';
import { UP_MAPPER_VERSION, UP_SOURCE_REF, type MappedUpTransaction } from './map-transaction.js';

import type {
  ConfirmedTransaction,
  ImportWarning,
} from '../../../contract/rest-imports-schemas.js';
import type { ContactsClient } from '../../contacts/client.js';
import type { ProcessedTransaction } from '../imports/types.js';
import type { SettleableRow } from './sync-plan.js';

export interface ImportedRows {
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

/**
 * Write mapped rows through the same process → commit pipeline a file import
 * uses, unattended. No rows still writes an empty batch: for an API source,
 * "checked, nothing new" is the fact the cadence read is measured from.
 */
export async function importMappedRows(
  db: FinanceDb,
  contacts: ContactsClient,
  target: { accountId: string; commitKey: string },
  rows: MappedUpTransaction[]
): Promise<ImportedRows> {
  const { accountId, commitKey } = target;
  if (rows.length === 0) {
    const batch = importBatchesService.insertBatch(
      db,
      {
        accountId,
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

  const mappedType = new Map(rows.map((row) => [row.parsed.checksum, row.transactionType]));
  const { output } = await processImportCore({
    db,
    contacts,
    transactions: rows.map((row) => row.parsed),
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
    batchId: result.batches?.find((b) => b.accountId === accountId)?.id ?? null,
    warnings: result.warnings ?? [],
  };
}

/** Mark stored held rows settled in place, with the date and amount Up settled them at. */
export function settleMappedRows(db: FinanceDb, settleable: readonly SettleableRow[]): number {
  for (const { transactionId, mapped } of settleable) {
    importsService.settleImportedTransaction(db, transactionId, {
      date: mapped.parsed.date,
      amountCents: Math.round(mapped.parsed.amount * 100),
      rawRow: mapped.parsed.rawRow,
    });
  }
  return settleable.length;
}
