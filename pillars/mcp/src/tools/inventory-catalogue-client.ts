import { getPillar } from '../pillar-client.js';
import { mapCallResult, toolError } from './utils.js';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { CallResult, PillarHandle } from '@pops/pillar-sdk/client';

type CatalogueOperation = Record<string, unknown>;
type CatalogueMigration = Record<string, unknown>;
type ItemFieldValue = {
  fieldId: string;
  source: 'stored' | 'override';
  values: readonly unknown[];
};

type CatalogueShape = {
  types: {
    read: {
      catalogue: (input: { revision?: number }) => unknown;
      audit: (input: { before?: number; limit?: number }) => unknown;
      validateItem: (input: {
        catalogueRevision: number;
        typeId: string;
        existingItemId?: string;
        fieldValues: readonly ItemFieldValue[];
      }) => unknown;
    };
    manage: {
      readDraft: () => unknown;
      createDraft: (input: { baseRevision: number }) => unknown;
      patchDraft: (input: {
        revision: number;
        baseRevision: number;
        expectedDraftVersion: number;
        operations: CatalogueOperation[];
      }) => unknown;
      previewDraft: (input: {
        revision: number;
        baseRevision: number;
        expectedDraftVersion: number;
        operations: CatalogueOperation[];
      }) => unknown;
      publishDraft: (input: {
        revision: number;
        baseRevision: number;
        expectedDraftVersion: number;
        note?: string | null;
        minimumProtocol?: number;
        migrationName?: string;
        migration?: CatalogueMigration;
      }) => unknown;
      abandonDraft: (input: {
        revision: number;
        baseRevision: number;
        expectedDraftVersion: number;
      }) => unknown;
    };
  };
};

/** Returns the typed inventory type-catalogue REST handle. */
export function catalogueClient(): PillarHandle<CatalogueShape>['types'] {
  return getPillar<CatalogueShape>('inventory').types;
}

const DRAFT_CONFLICT_RECOVERY =
  "Another session changed this draft. Call inventory.catalogue.readDraft, reapply the intended change to the draft it returns, and retry with that draft's revision.draftVersion as expectedDraftVersion.";

/**
 * Maps a draft-mutation result like `mapCallResult`, adding the recovery steps
 * when inventory refused the call because `expectedDraftVersion` was stale.
 */
export function mapDraftCallResult<T>(result: CallResult<T>): CallToolResult {
  const mapped = mapCallResult(result);
  if (result.kind !== 'conflict' || result.code !== 'catalogue_draft_conflict') return mapped;
  const [first] = mapped.content;
  const reason = first?.type === 'text' ? first.text : 'Catalogue draft version conflict.';
  return toolError(`${reason}\n${DRAFT_CONFLICT_RECOVERY}`);
}
