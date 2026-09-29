import type { CallResult } from '@pops/pillar-sdk/server';

import type { InventoryFakeOptions, InventoryItemCall } from './inventory-fake-types.js';

/** Builds the fake targeted item procedure and records every requested id. */
export function makeItemProcedure(
  options: InventoryFakeOptions,
  calls: InventoryItemCall[]
): (rawInput: unknown) => Promise<CallResult<unknown>> {
  return (rawInput) => {
    const id = readItemId(rawInput);
    calls.push({ id });
    const byId = options.itemResult ?? {};
    return Promise.resolve(
      byId[id] ?? { kind: 'not-found', pillar: 'inventory', message: `item ${id} not found` }
    );
  };
}

/** Reads the item id sent to the fake targeted-item route. */
export function readItemId(input: unknown): string {
  if (
    input !== null &&
    typeof input === 'object' &&
    'id' in input &&
    typeof input.id === 'string'
  ) {
    return input.id;
  }
  throw new Error('[bfm-test] inventory item route was called without an id');
}
