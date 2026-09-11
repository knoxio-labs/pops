/**
 * `Transaction` is derived from `TransactionSchema` (POPS-1510) specifically
 * so it cannot drift from the wire shape the way the old hand-written
 * interface did (`tagIds` that nothing ever served, `.date()`/`.datetime()`
 * validation the schema never applied). This pins that invariant: it fails
 * the moment either side goes back to being edited independently of the
 * other.
 */
import { describe, expectTypeOf, it } from 'vitest';

import type { z } from 'zod';

import type { TransactionSchema } from '../rest-transactions-schemas.js';
import type { Transaction } from '../types/transaction.js';

describe('@pops/finance contract round-trip', () => {
  it('Transaction ↔ TransactionSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof TransactionSchema>>().toEqualTypeOf<Transaction>();
  });
});
