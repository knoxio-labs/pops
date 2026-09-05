/**
 * Wire mappers for an account's import batches and config (POPS-2917). The
 * zod schemas live in the REST contract (`rest-account-imports-schemas.ts`);
 * this file keeps only the row → response projections.
 */
import type {
  ImportBatch,
  ImportConfig,
  WriteImportConfigBody,
} from '../../contract/rest-account-imports-schemas.js';
import type {
  AccountImportConfigRow,
  UpsertImportConfigInput,
} from '../../db/services/account-import-config.js';
import type { ImportBatchRow } from '../../db/services/import-batches.js';

export type { ImportBatch, ImportConfig, WriteImportConfigBody };

export function toImportBatch(row: ImportBatchRow): ImportBatch {
  return {
    id: row.id,
    accountId: row.accountId,
    sourceKind: row.sourceKind,
    sourceRef: row.sourceRef,
    parserVersion: row.parserVersion,
    commitKey: row.commitKey,
    rowCount: row.rowCount,
    dateFrom: row.dateFrom,
    dateTo: row.dateTo,
    checkpointId: row.checkpointId,
    createdAt: row.createdAt,
  };
}

export function toImportConfig(row: AccountImportConfigRow): ImportConfig {
  return {
    accountId: row.accountId,
    sourceKind: row.sourceKind,
    dialectId: row.dialectId,
    parserId: row.parserId,
    provider: row.provider,
    externalAccountRef: row.externalAccountRef,
    expectedCadenceDays: row.expectedCadenceDays,
    secretRef: row.secretRef,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toUpsertImportConfigInput(
  accountId: string,
  body: WriteImportConfigBody
): UpsertImportConfigInput {
  return {
    accountId,
    sourceKind: body.sourceKind,
    dialectId: body.dialectId ?? null,
    parserId: body.parserId ?? null,
    provider: body.provider ?? null,
    externalAccountRef: body.externalAccountRef ?? null,
    expectedCadenceDays: body.expectedCadenceDays ?? null,
    secretRef: body.secretRef ?? null,
  };
}
