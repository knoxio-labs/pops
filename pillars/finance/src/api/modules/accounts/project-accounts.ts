/**
 * Project account rows to their wire shape, resolving the things a row does
 * not carry: the contact display name (live from contacts, POPS-2771), the
 * checkpoint-anchored balance (ADR-051), the import status (POPS-2917), and
 * the transaction count (POPS-2924).
 *
 * All four are resolved for the WHOLE set at once. `balancesFor` costs three
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
  institutionsService,
  resolveAccountEntityDisplays,
  today,
  transactionCountsFor,
  type AccountBalance,
  type AccountEntityDisplay,
  type ImportStatus,
  type InstitutionsById,
} from '../../../db/index.js';
import { toAccount, type Account } from '../accounts-types.js';

import type { AccountRow, FinanceDb } from '../../../db/index.js';
import type { ContactsClient } from '../../contacts/client.js';

const NO_ISSUER: AccountEntityDisplay = {
  entityDisplayName: null,
  entityDisplayNameStale: false,
  entityColour: null,
  entityAvatarAssetId: null,
  resolvedEntityId: null,
  institution: null,
};

/** Every institution keyed by id, for {@link resolveAccountEntityDisplays}'s
 * not-yet-migrated fallback — the table is small enough to read whole per
 * request rather than filtering to just the ids the current page uses. */
function institutionsById(db: FinanceDb): InstitutionsById {
  return new Map(
    institutionsService.listInstitutions(db).map((institution) => [institution.id, institution])
  );
}

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
  inconsistent: false,
};

/** Same standing as {@link NO_BALANCE}: what an account never imported into says. */
const NO_IMPORT_STATUS: ImportStatus = {
  lastImportAt: null,
  lastBatchId: null,
  newestTransactionDate: null,
  span: null,
  cadenceDays: null,
  source: null,
};

/** Batched projections of account rows to their wire shape. */
export interface AccountProjector {
  many: (rows: AccountRow[], date?: string) => Promise<Account[]>;
  one: (row: AccountRow) => Promise<Account>;
}

export function makeAccountProjector(db: FinanceDb, contacts: ContactsClient): AccountProjector {
  async function many(rows: AccountRow[], date = today()): Promise<Account[]> {
    const displays = await resolveAccountEntityDisplays(contacts, rows, institutionsById(db));
    const ids = rows.map((row) => row.id);
    const balances = balancesFor(db, ids, date);
    const statuses = importStatusFor(db, ids);
    const transactionCounts = transactionCountsFor(db, ids);
    return rows.map((row) =>
      toAccount(row, displays.get(row.id) ?? NO_ISSUER, {
        balance: balances.get(row.id) ?? NO_BALANCE,
        importStatus: statuses.get(row.id) ?? NO_IMPORT_STATUS,
        transactionCount: transactionCounts.get(row.id) ?? 0,
      })
    );
  }

  async function one(row: AccountRow): Promise<Account> {
    const [account] = await many([row]);
    return (
      account ??
      toAccount(row, NO_ISSUER, {
        balance: NO_BALANCE,
        importStatus: NO_IMPORT_STATUS,
        transactionCount: 0,
      })
    );
  }

  return { many, one };
}
