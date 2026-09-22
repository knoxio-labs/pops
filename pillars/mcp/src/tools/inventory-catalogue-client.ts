import { getPillar } from '../pillar-client.js';

import type { PillarHandle } from '@pops/pillar-sdk/client';

type CatalogueOperation = Record<string, unknown>;
type CatalogueMigration = Record<string, unknown>;

type CatalogueShape = {
  types: {
    read: {
      catalogue: (input: { revision?: number }) => unknown;
      audit: (input: { before?: number; limit?: number }) => unknown;
    };
    manage: {
      createDraft: (input: { baseRevision: number }) => unknown;
      patchDraft: (input: {
        revision: number;
        baseRevision: number;
        operations: CatalogueOperation[];
      }) => unknown;
      publishDraft: (input: {
        revision: number;
        baseRevision: number;
        note?: string | null;
        minimumProtocol?: number;
        migrationName?: string;
        migration?: CatalogueMigration;
      }) => unknown;
      abandonDraft: (input: { revision: number; baseRevision: number }) => unknown;
    };
  };
};

/** Returns the typed inventory type-catalogue REST handle. */
export function catalogueClient(): PillarHandle<CatalogueShape>['types'] {
  return getPillar<CatalogueShape>('inventory').types;
}
