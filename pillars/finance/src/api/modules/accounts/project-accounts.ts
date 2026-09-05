/**
 * Project account rows to their wire shape, resolving the two things a row
 * does not carry: the contact display name (live from contacts, POPS-2771)
 * and the checkpoint-anchored balance (ADR-051).
 *
 * Both are resolved for the WHOLE set at once. `balancesFor` costs three
 * grouped queries regardless of how many accounts are on the page, where a
 * per-row `balanceAsOf` would cost a handful each; `resolveAccountEntityDisplays`
 * already batched its side. Every accounts response — the list, one account, a
 * merge preview — goes through here so none of them can drift into an N+1.
 */
import {
  balancesFor,
  resolveAccountEntityDisplays,
  today,
  type AccountBalance,
} from '../../../db/index.js';
import { toAccount, type Account } from '../accounts-types.js';

import type { AccountRow, FinanceDb } from '../../../db/index.js';
import type { ContactsClient } from '../../contacts/client.js';

const NOT_A_PERSON = { entityDisplayName: null, entityDisplayNameStale: false };

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

/** Batched projections of account rows to their wire shape. */
export interface AccountProjector {
  many: (rows: AccountRow[], date?: string) => Promise<Account[]>;
  one: (row: AccountRow) => Promise<Account>;
}

export function makeAccountProjector(db: FinanceDb, contacts: ContactsClient): AccountProjector {
  async function many(rows: AccountRow[], date = today()): Promise<Account[]> {
    const displays = await resolveAccountEntityDisplays(contacts, rows);
    const balances = balancesFor(
      db,
      rows.map((row) => row.id),
      date
    );
    return rows.map((row) =>
      toAccount(row, displays.get(row.id) ?? NOT_A_PERSON, balances.get(row.id) ?? NO_BALANCE)
    );
  }

  async function one(row: AccountRow): Promise<Account> {
    const [account] = await many([row]);
    return account ?? toAccount(row, NOT_A_PERSON, NO_BALANCE);
  }

  return { many, one };
}
