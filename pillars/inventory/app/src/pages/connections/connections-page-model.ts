import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import { useDebouncedValue } from '@pops/ui';

import { useSelection } from '../../foundation/selection/use-selection.js';
import { useChangedElsewhere } from '../../inventory-web/useChangedElsewhere.js';
import {
  CONNECTIONS_REGISTRY_QUERY_KEY,
  useAllConnections,
  useConnectionMutations,
  useConnectionsRegistry,
} from '../../inventory-web/useConnectionsRegistry.js';
import { useOnline } from '../../inventory-web/useOnline.js';
import { usePlacementSources } from '../../inventory-web/usePlacementSources.js';
import { connectionTrace } from './connection-trace.js';
import {
  isConnectionKind,
  parseConnectionsUrl,
  type ConnectionKind,
  type ConnectionView,
  type ConnectionsUrlPatch,
  type ConnectionsUrlState,
  writeConnectionsUrl,
} from './connections-url.js';

import type { PickerSubject } from '../../foundation/model/contracts.js';

/** The data and URL controls consumed by the Connections page. */
export interface ConnectionsPageModel {
  readonly url: ConnectionsUrlState;
  readonly queryDraft: string;
  readonly kindDraft: ConnectionKind;
  readonly registry: ReturnType<typeof useConnectionsRegistry>;
  readonly allConnections: ReturnType<typeof useAllConnections>;
  readonly placement: ReturnType<typeof usePlacementSources>;
  readonly online: boolean;
  readonly changed: ReturnType<typeof useChangedElsewhere>;
  readonly selection: ReturnType<typeof useSelection>;
  readonly mutations: ReturnType<typeof useConnectionMutations>;
  readonly narrowed: boolean;
  readonly trace: ReturnType<typeof connectionTrace>;
  readonly setQueryDraft: (value: string) => void;
  readonly setKindDraft: (value: ConnectionKind) => void;
  readonly setView: (value: ConnectionView) => void;
  readonly setTrace: (value: string | null) => void;
  readonly clearFilters: () => void;
  readonly retry: () => void;
}

function useConnectionsUrlState(): {
  readonly url: ConnectionsUrlState;
  readonly queryDraft: string;
  readonly kindDraft: ConnectionKind;
  readonly setQueryDraft: (value: string) => void;
  readonly setKindDraft: (value: ConnectionKind) => void;
  readonly setView: (value: ConnectionView) => void;
  readonly setTrace: (value: string | null) => void;
  readonly clearFilters: () => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const url = parseConnectionsUrl(searchParams);
  const queryDraftState = useUrlDraft(url.q);
  const kindDraftState = useUrlDraft<ConnectionKind>(url.kind);

  const write = useCallback(
    (patch: ConnectionsUrlPatch): void => {
      setSearchParams((current) => writeConnectionsUrl(current, patch), { replace: true });
    },
    [setSearchParams]
  );

  useDebouncedUrlWrite({
    value: queryDraftState.value,
    urlValue: url.q,
    dirty: queryDraftState.dirty,
    delay: 200,
    write,
    patch: (value) => ({ q: value }),
  });
  useDebouncedUrlWrite({
    value: kindDraftState.value,
    urlValue: url.kind,
    dirty: kindDraftState.dirty,
    delay: 150,
    write,
    patch: (value) => ({ kind: isConnectionKind(value) ? value : url.kind }),
  });

  const setView = useCallback((value: ConnectionView): void => write({ view: value }), [write]);
  const setTrace = useCallback((value: string | null): void => write({ trace: value }), [write]);
  const setQueryDraft = queryDraftState.setValue;
  const setKindDraft = kindDraftState.setValue;
  const clearFilters = useCallback((): void => {
    setQueryDraft('');
    setKindDraft('all');
    write({ q: '', kind: 'all' });
  }, [setKindDraft, setQueryDraft, write]);

  return {
    url,
    queryDraft: queryDraftState.value,
    kindDraft: kindDraftState.value,
    setQueryDraft,
    setKindDraft,
    setView,
    setTrace,
    clearFilters,
  };
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

function useDebouncedUrlWrite({
  value,
  urlValue,
  dirty,
  delay,
  write,
  patch,
}: {
  readonly value: string;
  readonly urlValue: string;
  readonly dirty: boolean;
  readonly delay: number;
  readonly write: (patch: ConnectionsUrlPatch) => void;
  readonly patch: (value: string) => ConnectionsUrlPatch;
}): void {
  const debouncedValue = useDebouncedValue(value, delay);
  useEffect(() => {
    if (dirty && debouncedValue !== urlValue) write(patch(debouncedValue));
  }, [debouncedValue, dirty, patch, urlValue, write]);
}

/** Reads the Connections page, URL state, placement rooms, and mutation APIs. */
export function useConnectionsPageModel(): ConnectionsPageModel {
  const urlState = useConnectionsUrlState();
  const registry = useConnectionsRegistry({ kind: urlState.url.kind, q: urlState.url.q });
  const allConnections = useAllConnections();
  const online = useOnline();
  const mutations = useConnectionMutations();
  const queryClient = useQueryClient();
  const selection = useSelection(registry.rows.map((row) => row.id));
  const placementSubject = useMemo<PickerSubject>(
    () => ({
      kind: 'items',
      ids: registry.rows.map((row) => row.item.id),
    }),
    [registry.rows]
  );
  const placement = usePlacementSources(placementSubject);
  const changed = useChangedElsewhere({
    queryKeys: [CONNECTIONS_REGISTRY_QUERY_KEY],
    enabled: registry.status === 'success',
  });
  const trace = useMemo(
    () =>
      urlState.url.trace === null || allConnections.status !== 'success'
        ? null
        : connectionTrace(allConnections.rows, urlState.url.trace),
    [allConnections.rows, allConnections.status, urlState.url.trace]
  );
  const retry = useCallback((): void => {
    void queryClient.refetchQueries({ queryKey: CONNECTIONS_REGISTRY_QUERY_KEY });
  }, [queryClient]);

  return {
    ...urlState,
    registry,
    allConnections,
    placement,
    online,
    changed,
    selection,
    mutations,
    narrowed: urlState.url.q !== '' || urlState.url.kind !== 'all',
    trace,
    retry,
  };
}
