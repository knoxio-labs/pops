/**
 * Project account rows to their wire shape, resolving the things a row does
 * not carry: the contact display name (live from contacts, POPS-2771), the
 * checkpoint-anchored balance (finance ADR-002), the import status (POPS-2917),
 * the transaction count (POPS-2924), and the caller's standing on the account
 * (POPS-5866).
 *
 * The first four are resolved for the WHOLE set at once. `balancesFor` costs three
 * grouped queries regardless of how many accounts are on the page, where a
 * per-row `balanceAsOf` would cost a handful each; `resolveAccountEntityDisplays`
 * already batched its side, and `transactionCountsFor` is one more grouped
 * query rather than a count per row. Every accounts response — the list, one
 * account, a merge preview — goes through here so none of them can drift
 * into an N+1.
 */
import {
  balancesFor,
  importStatusFor,
  resolveAccountEntityDisplays,
  today,
  transactionCountsFor,
  type AccountBalance,
  type AccountEntityDisplay,
  type ImportStatus,
} from '../../../db/index.js';
import { viewerRole, type AccountAccess } from '../../rest/guest-access.js';
import { toAccount, type Account } from '../accounts-types.js';

import type { AccountRow, FinanceDb } from '../../../db/index.js';
import type { ContactsClient } from '../../contacts/client.js';

const NO_ISSUER: AccountEntityDisplay = {
  entityDisplayName: null,
  entityDisplayNameStale: false,
  entityColour: null,
  entityAvatarAssetId: null,
  resolvedEntityId: null,
};

/**
 * The balance shown when there is nothing to compute one from. Unreachable in
 * practice — `balancesFor` answers for every id it is given — and present only
 * so a missing entry degrades to a stated zero rather than to `undefined`
 * crossing the wire against a required field.
 */
const NO_BALANCE: AccountBalance = {
  balanceCents: 0,
  asOf: '',
  basis: 'transactions',
  anchor: null,
  reconciliation: 'unmeasured',
  inconsistent: false,
};

/** Same standing as {@link NO_BALANCE}: what an account never imported into says. */
const NO_IMPORT_STATUS: ImportStatus = {
  lastImportAt: null,
  lastSyncedAt: null,
  lastBatchId: null,
  newestTransactionDate: null,
  span: null,
  cadenceDays: null,
  source: null,
};

/**
 * Batched projections of account rows to their wire shape. `access` is the
 * caller's reach, and every row handed in must lie within it.
 */
export interface AccountProjector {
  many: (rows: AccountRow[], access: AccountAccess, date?: string) => Promise<Account[]>;
  one: (row: AccountRow, access: AccountAccess) => Promise<Account>;
}

export function makeAccountProjector(db: FinanceDb, contacts: ContactsClient): AccountProjector {
  async function many(
    rows: AccountRow[],
    access: AccountAccess,
    date = today()
  ): Promise<Account[]> {
    const displays = await resolveAccountEntityDisplays(contacts, rows);
    const ids = rows.map((row) => row.id);
    const balances = balancesFor(db, ids, date);
    const statuses = importStatusFor(db, ids);
    const transactionCounts = transactionCountsFor(db, ids);
    return rows.map((row) =>
      toAccount(row, displays.get(row.id) ?? NO_ISSUER, {
        balance: balances.get(row.id) ?? NO_BALANCE,
        importStatus: statuses.get(row.id) ?? NO_IMPORT_STATUS,
        transactionCount: transactionCounts.get(row.id) ?? 0,
        viewerRole: viewerRole(access, row.id),
      })
    );
  }

  async function one(row: AccountRow, access: AccountAccess): Promise<Account> {
    const [account] = await many([row], access);
    return (
      account ??
      toAccount(row, NO_ISSUER, {
        balance: NO_BALANCE,
        importStatus: NO_IMPORT_STATUS,
        transactionCount: 0,
        viewerRole: viewerRole(access, row.id),
      })
    );
  }

  return { many, one };
}
