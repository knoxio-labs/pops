import {
  transactionsService,
  type FinanceDb,
  type TransactionActor,
  type TransactionRow,
  type UpdateTransactionInput,
} from '../../db/index.js';
import { loadEntityIdentities } from '../contacts/identity-snapshot.js';
import { pairSavedTransfer } from '../modules/transfers/pair-on-save.js';

import type { ContactsClient } from '../contacts/types.js';

/** Resolve an entity edit before its write, preserving equivalent historical references and transfer pairing. */
export async function updateCanonicalTransaction(
  db: FinanceDb,
  contacts: ContactsClient,
  id: string,
  input: { input: UpdateTransactionInput; actor: TransactionActor }
): Promise<TransactionRow> {
  const entityId = input.input.entityId;
  const identities =
    entityId === undefined
      ? undefined
      : await loadEntityIdentities(db, contacts, entityId ? [entityId] : []);
  return pairSavedTransfer(
    db,
    transactionsService.updateTransaction(db, id, input.input, { actor: input.actor, identities })
  );
}
