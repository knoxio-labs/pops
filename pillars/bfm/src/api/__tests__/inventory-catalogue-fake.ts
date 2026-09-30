import type { CallResult } from '@pops/pillar-sdk/server';

import type { InventoryFakeOptions } from './inventory-fake-types.js';

export interface InventoryCatalogueFake {
  readonly catalogue: () => Promise<CallResult<unknown>>;
  readonly catalogueRevision: (rawInput: unknown) => Promise<CallResult<unknown>>;
  readonly calls: number;
}

/** Build the catalogue read procedures and expose their call count. */
export function makeInventoryCatalogueFake(options: InventoryFakeOptions): InventoryCatalogueFake {
  let calls = 0;
  const catalogue = (): Promise<CallResult<unknown>> => {
    calls += 1;
    return Promise.resolve(
      options.catalogueResult ?? { kind: 'ok', value: { version: 'cat-1', units: [], types: [] } }
    );
  };
  const catalogueRevision = (rawInput: unknown): Promise<CallResult<unknown>> => {
    const revision =
      rawInput !== null &&
      typeof rawInput === 'object' &&
      'revision' in rawInput &&
      typeof rawInput.revision === 'number'
        ? rawInput.revision
        : Number.NaN;
    return Promise.resolve(
      options.catalogueRevisionResult?.(revision) ?? {
        kind: 'not-found',
        pillar: 'inventory',
        message: `Catalogue revision ${String(revision)} was not found`,
      }
    );
  };
  return {
    catalogue,
    catalogueRevision,
    get calls() {
      return calls;
    },
  };
}
