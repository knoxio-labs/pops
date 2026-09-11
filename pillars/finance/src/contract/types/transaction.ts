import type { z } from 'zod';

import type { TransactionSchema } from '../rest-transactions-schemas.js';

/**
 * A single finance transaction (camelCase), as served by the `transactions.*`
 * endpoints. Inferred from `TransactionSchema` so it cannot drift from the wire.
 * The DB-internal row shape lives in the pillar's `src/db` layer and is not
 * surfaced through the contract.
 */
export type Transaction = z.infer<typeof TransactionSchema>;
