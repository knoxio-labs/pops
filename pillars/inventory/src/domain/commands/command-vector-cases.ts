/**
 * Every command-vector case, one per registered op: the item-op cases and
 * the location-op cases concatenated in a stable order.
 */
import { ITEM_COMMAND_VECTOR_CASES_2 } from './command-vector-cases-items-2.js';
import { ITEM_COMMAND_VECTOR_CASES } from './command-vector-cases-items.js';
import { LOCATION_COMMAND_VECTOR_CASES } from './command-vector-cases-locations.js';

import type { CommandVectorCase } from './command-vector-fixture.js';

/** Every registered op gets at least one vector, an `applied` case exercising its primary field change. */
export const COMMAND_VECTOR_CASES: readonly CommandVectorCase[] = [
  ...ITEM_COMMAND_VECTOR_CASES,
  ...ITEM_COMMAND_VECTOR_CASES_2,
  ...LOCATION_COMMAND_VECTOR_CASES,
];
