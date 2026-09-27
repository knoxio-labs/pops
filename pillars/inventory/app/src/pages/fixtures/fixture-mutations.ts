import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { unwrap } from '../../inventory-api-helpers.js';
import * as inventoryApi from '../../inventory-api/index.js';
import { markConnectionsWrittenHere } from '../../inventory-web/useConnectionsChanged.js';

import type { FixturesCreateData } from '../../inventory-api/types.gen.js';
import type { FixtureDraft } from './fixture-form-dialog.js';
import type { FixtureDetail } from './fixture-model.js';

const FIXTURES_QUERY_PREFIX = ['inventory', 'fixtures'] as const;

/** The input for either creating a fixture or updating one. */
export interface SaveFixtureInput {
  readonly id?: string;
  readonly draft: FixtureDraft;
}

function fixtureWriteBody(draft: FixtureDraft): NonNullable<FixturesCreateData['body']> {
  if (draft.kind === null) throw new Error('Choose its kind.');
  return {
    name: draft.name.trim(),
    type: draft.kind,
    locationId: draft.locationId,
    notes: draft.notes === null || draft.notes.trim() === '' ? null : draft.notes.trim(),
  };
}

/** Provides create and update operations and invalidates every fixture read they affect. */
export function useFixtureMutations() {
  const queryClient = useQueryClient();
  const saveMutation = useMutation({
    mutationFn: async ({ id, draft }: SaveFixtureInput): Promise<FixtureDetail> => {
      const body = fixtureWriteBody(draft);
      if (id === undefined) return (await unwrap(await inventoryApi.fixturesCreate({ body }))).data;
      return (await unwrap(await inventoryApi.fixturesUpdate({ path: { id }, body }))).data;
    },
    onSuccess: async () => {
      markConnectionsWrittenHere();
      await queryClient.invalidateQueries({ queryKey: FIXTURES_QUERY_PREFIX });
    },
  });

  const save = useCallback(
    (input: SaveFixtureInput): Promise<FixtureDetail> => saveMutation.mutateAsync(input),
    [saveMutation]
  );

  return { save, isSaving: saveMutation.isPending, error: saveMutation.error };
}
