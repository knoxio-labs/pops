import type { NullableColumnKeys as ColumnKeys } from '@pops/pillar-sdk/db';

import type { homeInventory } from '../../../db/index.js';

/**
 * {@link ColumnKeys} bound to `home_inventory`, so the item builders name the
 * table once rather than at every key list. See the shared module for what the
 * constraint buys and why the naive `keyof Input & keyof Row` does not.
 */
export type NullableColumnKeys<Input, V> = ColumnKeys<Input, typeof homeInventory.$inferInsert, V>;
