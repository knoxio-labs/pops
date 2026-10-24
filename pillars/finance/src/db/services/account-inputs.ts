import type { AccountKind } from '../../contract/account-kind.js';

/** Fields accepted on create. */
export interface CreateAccountInput {
  name: string;
  kind: AccountKind;
  currency: string;
  displayOrder?: number;
  entityId?: string | null;
}

/** Same shape as create — all fields optional for PATCH semantics, plus `archivedAt`. */
export interface UpdateAccountInput {
  name?: string;
  kind?: AccountKind;
  currency?: string;
  displayOrder?: number;
  entityId?: string | null;
  archivedAt?: string | null;
}
