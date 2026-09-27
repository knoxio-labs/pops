import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import { useDebouncedValue } from '@pops/ui';

import { unwrap } from '../../inventory-api-helpers.js';
import * as inventoryApi from '../../inventory-api/index.js';
import { useChangedElsewhere } from '../../inventory-web/useChangedElsewhere.js';
import { useConnectionMutations } from '../../inventory-web/useConnectionsRegistry.js';
import {
  fixtureItemsQueryKey,
  useFixtureItems,
  useFixtures,
} from '../../inventory-web/useFixtures.js';
import { useOnline } from '../../inventory-web/useOnline.js';
import { useLocationModels } from '../location-page/location-page-model.js';
import { isFixtureKind } from './fixture-kinds.js';
import { fixtureDetailStatus } from './fixture-model.js';
import { fixtureInvalidationKeys, fixtureQueryKey } from './fixture-query-keys.js';
import { parseFixturesUrl, writeFixturesUrl } from './fixtures-url.js';

import type { FixturesCreateData, FixturesUpdateData } from '../../inventory-api/types.gen.js';
import type { FixtureKind } from './fixture-kinds.js';
import type { FixtureFilter } from './fixture-model.js';

export { fixtureQueryKey } from './fixture-query-keys.js';

/** The values accepted by the fixture create and update form. */
export interface FixtureDraft {
  readonly name: string;
  readonly type: string;
  readonly locationId: string | null;
  readonly notes: string | null;
}

/** The input for either creating a fixture or updating one. */
export interface SaveFixtureInput {
  readonly id?: string;
  readonly draft: FixtureDraft;
}

/** Reads fixture filters from the URL while keeping typing responsive. */
export interface FixturesFilterState {
  readonly url: ReturnType<typeof parseFixturesUrl>;
  readonly queryDraft: string;
  readonly kindDraft: FixtureKind | null;
  readonly filter: FixtureFilter;
  readonly serverFilter: FixtureFilter;
  readonly setQueryDraft: (value: string) => void;
  readonly setKindDraft: (value: FixtureKind | null) => void;
  readonly clearFilters: () => void;
}

interface UrlDraft<T extends string> {
  readonly value: T;
  readonly dirty: boolean;
  readonly setValue: (value: T) => void;
}

function useUrlDraft<T extends string>(urlValue: T): UrlDraft<T> {
  const [draft, setDraft] = useState({ value: urlValue, urlValue });
  const value = draft.urlValue === urlValue ? draft.value : urlValue;
  const setValue = useCallback(
    (nextValue: T): void => setDraft({ value: nextValue, urlValue }),
    [urlValue]
  );
  return { value, dirty: draft.urlValue === urlValue, setValue };
}

function useFixturesFilterState(): FixturesFilterState {
  const [searchParams, setSearchParams] = useSearchParams();
  const url = parseFixturesUrl(searchParams);
  const queryState = useUrlDraft(url.q);
  const kindState = useUrlDraft<FixtureKind | ''>(url.kind ?? '');
  const write = useCallback(
    (patch: Partial<ReturnType<typeof parseFixturesUrl>>): void => {
      setSearchParams((current) => writeFixturesUrl(current, patch), { replace: true });
    },
    [setSearchParams]
  );

  const queryValue = useDebouncedValue(queryState.value, 200);
  const kindValue = useDebouncedValue(kindState.value, 150);
  useEffect(() => {
    if (queryState.dirty && queryValue !== url.q) write({ q: queryValue });
  }, [queryState.dirty, queryValue, url.q, write]);
  useEffect(() => {
    const nextKind = isFixtureKind(kindValue) ? kindValue : null;
    if (kindState.dirty && nextKind !== url.kind) write({ kind: nextKind });
  }, [kindState.dirty, kindValue, url.kind, write]);

  const setKindDraft = useCallback(
    (value: FixtureKind | null): void => kindState.setValue(value ?? ''),
    [kindState]
  );
  const clearFilters = useCallback((): void => {
    queryState.setValue('');
    setKindDraft(null);
    write({ q: '', kind: null });
  }, [queryState, setKindDraft, write]);

  return {
    url,
    queryDraft: queryState.value,
    kindDraft: kindState.value === '' ? null : kindState.value,
    filter: { q: queryState.value, kind: kindState.value === '' ? null : kindState.value },
    serverFilter: { q: queryValue, kind: kindValue === '' ? null : kindValue },
    setQueryDraft: queryState.setValue,
    setKindDraft,
    clearFilters,
  };
}

function fixtureWriteBody(draft: FixtureDraft): NonNullable<FixturesCreateData['body']> {
  return {
    name: draft.name.trim(),
    type: draft.type,
    locationId: draft.locationId,
    notes: draft.notes === null || draft.notes.trim() === '' ? null : draft.notes.trim(),
  };
}

/** Provides create and update operations and invalidates every fixture read they affect. */
export function useFixtureMutations() {
  const queryClient = useQueryClient();
  const saveMutation = useMutation({
    mutationFn: async ({ id, draft }: SaveFixtureInput) => {
      const body = fixtureWriteBody(draft);
      if (id === undefined) return unwrap(await inventoryApi.fixturesCreate({ body }));
      const updateBody: NonNullable<FixturesUpdateData['body']> = body;
      return unwrap(await inventoryApi.fixturesUpdate({ path: { id }, body: updateBody }));
    },
    onSettled: (_data, _error, variables) => {
      for (const queryKey of fixtureInvalidationKeys(variables?.id)) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });

  const save = useCallback(
    async (input: SaveFixtureInput): Promise<void> => {
      await saveMutation.mutateAsync(input);
    },
    [saveMutation]
  );

  return {
    save,
    isSaving: saveMutation.isPending,
    error: saveMutation.error,
  };
}

/** Reads and mutates the server-backed fixture list page. */
export function useFixturesPageModel() {
  const filters = useFixturesFilterState();
  const fixtures = useFixtures({
    search: filters.serverFilter.q,
    type: filters.serverFilter.kind,
    withinLocationId: null,
  });
  const locations = useLocationModels();
  const online = useOnline();
  const changedQueryKeys = useMemo(() => fixtureInvalidationKeys(), []);
  const changed = useChangedElsewhere({
    queryKeys: changedQueryKeys,
    enabled: fixtures.status === 'success',
  });
  const mutations = useFixtureMutations();
  const retry = useCallback((): void => {
    fixtures.refetch();
    locations.refetch();
  }, [fixtures, locations]);

  return { filters, fixtures, locations, online, changed, mutations, retry };
}

/** Reads one fixture, its wired items, locations, and page-level write state. */
export function useFixtureDetailPageModel(id: string) {
  const fixtureQuery = useQuery({
    queryKey: fixtureQueryKey(id),
    queryFn: async () => unwrap(await inventoryApi.fixturesGet({ path: { id } })),
    enabled: id.length > 0,
    refetchOnWindowFocus: false,
  });
  const items = useFixtureItems(id);
  const locations = useLocationModels();
  const online = useOnline();
  const changedQueryKeys = useMemo(() => fixtureInvalidationKeys(id), [id]);
  const changed = useChangedElsewhere({
    queryKeys: changedQueryKeys,
    entityId: id,
    enabled: fixtureQuery.status === 'success',
  });
  const mutations = useFixtureMutations();
  const connectionMutations = useConnectionMutations();
  const queryClient = useQueryClient();
  const refetch = useCallback((): void => {
    void queryClient.refetchQueries({ queryKey: fixtureQueryKey(id) });
    void queryClient.refetchQueries({ queryKey: fixtureItemsQueryKey(id) });
    locations.refetch();
  }, [id, locations, queryClient]);
  const fixture = fixtureQuery.data?.data;
  const error = fixtureQuery.error ?? items.error ?? null;
  const loading = fixtureQuery.status === 'pending' || items.status === 'pending';

  return {
    id,
    fixture,
    items,
    locations,
    online,
    changed,
    mutations,
    connectionMutations,
    status: fixtureDetailStatus(loading, error),
    error,
    refetch,
  };
}
