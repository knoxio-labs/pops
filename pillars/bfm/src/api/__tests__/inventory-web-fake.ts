import { MobileInventoryItemsQuerySchema } from '../../contract/mobile-inventory-list-schemas.js';

import type { CallResult } from '@pops/pillar-sdk/server';

import type { InventoryFakeOptions, InventoryWebItemsCall } from './inventory-fake-types.js';

function readWebItemsCall(input: unknown): InventoryWebItemsCall {
  const parsed = MobileInventoryItemsQuerySchema.safeParse(input);
  if (!parsed.success) throw new Error('the fake received an invalid web item query');
  return parsed.data;
}

/** Build the bounded web-item read and retain each parsed request. */
export function makeInventoryWebItemsFake(
  options: InventoryFakeOptions,
  calls: InventoryWebItemsCall[]
): (rawInput: unknown) => Promise<CallResult<unknown>> {
  return (rawInput) => {
    calls.push(readWebItemsCall(rawInput));
    return Promise.resolve(
      options.webItemsResult ?? {
        kind: 'ok',
        value: {
          items: [],
          contentCounts: {},
          nextCursor: null,
          total: 0,
          unfilteredTotal: 0,
          hiddenInactiveCount: 0,
        },
      }
    );
  };
}
