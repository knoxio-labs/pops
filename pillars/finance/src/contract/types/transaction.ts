import type { z } from 'zod';

import type { TransactionSchema } from '../rest-transactions-schemas.js';

/**
 * A single finance transaction (camelCase), as served by the `transactions.*`
 * endpoints. The DB-internal row shape lives in the pillar's `src/db` layer
 * and is not surfaced through the contract.
 *
 * Derived from `TransactionSchema` (`pillars/finance/src/contract/rest-transactions-schemas.ts`)
 * rather than hand-maintained, so this type cannot drift from what the wire
 * actually serves (POPS-1510).
 */
export type Transaction = z.infer<typeof TransactionSchema>;
