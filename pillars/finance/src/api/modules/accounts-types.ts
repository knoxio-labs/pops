/**
 * Wire mapper for the accounts domain (POPS-2767). The zod schemas live in
 * the REST contract (`src/contract/rest-accounts.ts`); this file keeps only
 * the row → response projection and its TS shape.
 */
import type { AccountKind } from '../../contract/account-kind.js';
import type {
  AccountEntityDisplay,
  AccountMergePreview,
  AccountRow,
  CreateAccountInput,
  UpdateAccountInput,
} from '../../db/index.js';

/** API response shape (camelCase). */
export interface Account {
  id: string;
  name: string;
  institutionId: string | null;
  kind: AccountKind;
  currency: string;
  archivedAt: string | null;
  displayOrder: number;
  entityId: string | null;
  /** The contact's display name resolved live from contacts (POPS-2771);
   * `accounts.name` with `entityDisplayNameStale: true` when contacts
   * couldn't be reached to refresh it. `null` for a non-`person` account. */
  entityDisplayName: string | null;
  entityDisplayNameStale: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Wire body accepted by `POST /accounts`. */
export interface CreateAccountBody {
  name: string;
  institutionId?: string | null;
  kind: AccountKind;
  currency: string;
  displayOrder?: number;
  entityId?: string | null;
}

/** Wire body accepted by `PATCH /accounts/:id`. */
export interface UpdateAccountBody {
  name?: string;
  institutionId?: string | null;
  kind?: AccountKind;
  currency?: string;
  displayOrder?: number;
  entityId?: string | null;
  archivedAt?: string | null;
}

/** Map a SQLite row (plus its resolved contact display, from
 * `resolveAccountEntityDisplays`) to the API response shape. */
export function toAccount(row: AccountRow, entityDisplay: AccountEntityDisplay): Account {
  return {
    id: row.id,
    name: row.name,
    institutionId: row.institutionId,
    kind: row.kind,
    currency: row.currency,
    archivedAt: row.archivedAt,
    displayOrder: row.displayOrder,
    entityId: row.entityId,
    entityDisplayName: entityDisplay.entityDisplayName,
    entityDisplayNameStale: entityDisplay.entityDisplayNameStale,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Map a create request body to the persistence layer's input shape. */
export function toCreateAccountInput(body: CreateAccountBody): CreateAccountInput {
  return {
    name: body.name,
    institutionId: body.institutionId ?? null,
    kind: body.kind,
    currency: body.currency,
    displayOrder: body.displayOrder,
    entityId: body.entityId ?? null,
  };
}

/** Map an update request body to the persistence layer's input shape. */
export function toUpdateAccountInput(body: UpdateAccountBody): UpdateAccountInput {
  return {
    name: body.name,
    institutionId: body.institutionId,
    kind: body.kind,
    currency: body.currency,
    displayOrder: body.displayOrder,
    entityId: body.entityId,
    archivedAt: body.archivedAt,
  };
}

/** API response shape for `POST /accounts/:id/merge/preview` (POPS-2812). */
export interface AccountMergePreviewBody {
  source: Account;
  target: Account;
  transactionCount: number;
  resultingBalanceCents: number;
  hasGiftCardDetailsConflict: boolean;
}

/** Map a merge preview (plus its two accounts' resolved contact displays) to the API response shape. */
export function toAccountMergePreviewBody(
  preview: AccountMergePreview,
  sourceDisplay: AccountEntityDisplay,
  targetDisplay: AccountEntityDisplay
): AccountMergePreviewBody {
  return {
    source: toAccount(preview.source, sourceDisplay),
    target: toAccount(preview.target, targetDisplay),
    transactionCount: preview.transactionCount,
    resultingBalanceCents: preview.resultingBalanceCents,
    hasGiftCardDetailsConflict: preview.hasGiftCardDetailsConflict,
  };
}
