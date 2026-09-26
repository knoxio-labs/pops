import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { unwrap } from '../inventory-api-helpers.js';
import { webChangesHead } from '../inventory-api/index.js';

import type { QueryClient, QueryKey } from '@tanstack/react-query';

import type { WebChangesHeadData, WebChangesHeadResponse } from '../inventory-api/types.gen.js';

/** Polling interval for changed-elsewhere banners. */
export const CHANGES_POLL_MS = 30_000;

/** One actor-grouped set of changes returned by the changed-elsewhere endpoint. */
export type WebChangeGroup = WebChangesHeadResponse['groups'][number];

/** Inputs controlling a changed-elsewhere baseline and its Reload action. */
export interface ChangedElsewhereOptions {
  /** The page queries Reload refetches after a remote change is found. */
  readonly queryKeys: readonly QueryKey[];
  /** Restrict remote changes to one item or location. */
  readonly entityId?: string;
  /** False until the page's initial data is ready to establish a baseline. */
  readonly enabled?: boolean;
}

/** Remote changes since the page loaded and an explicit reload operation. */
export interface ChangedElsewhere {
  readonly groups: WebChangeGroup[];
  readonly stale: boolean;
  readonly reload: () => Promise<void>;
}

function headKey(entityId: string | undefined, since: number | undefined): readonly unknown[] {
  return ['inventory', 'changes-head', entityId ?? null, since ?? null];
}

function headQuery(
  entityId: string | undefined,
  since: number | undefined
): WebChangesHeadData['query'] {
  const query: WebChangesHeadData['query'] = {};
  if (entityId !== undefined) query.entityId = entityId;
  if (since !== undefined) query.since = since;
  return query;
}

type ReadHead = (since?: number) => Promise<WebChangesHeadResponse>;

function useHeadReader(queryClient: QueryClient, entityId: string | undefined): ReadHead {
  return useCallback(
    (since?: number): Promise<WebChangesHeadResponse> =>
      queryClient.fetchQuery<WebChangesHeadResponse>({
        queryKey: headKey(entityId, since),
        queryFn: async () =>
          unwrap(
            await webChangesHead({
              query: headQuery(entityId, since),
            })
          ),
        staleTime: 0,
      }),
    [entityId, queryClient]
  );
}

async function pollChanges(
  readHead: ReadHead,
  baseline: { readonly current: number | null },
  isCurrent: () => boolean,
  setGroups: (groups: WebChangeGroup[]) => void
): Promise<void> {
  const since = baseline.current;
  if (
    !isCurrent() ||
    since === null ||
    typeof document === 'undefined' ||
    document.visibilityState !== 'visible'
  ) {
    return;
  }
  try {
    const head = await readHead(since);
    if (isCurrent()) setGroups(head.groups);
  } catch {
    return;
  }
}

function watchVisibility(poll: () => void): () => void {
  const timer = window.setInterval(poll, CHANGES_POLL_MS);
  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') poll();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}

function useVisibilityPolling(
  enabled: boolean,
  readHead: ReadHead
): {
  readonly groups: WebChangeGroup[];
  readonly reset: () => Promise<void>;
} {
  const baseline = useRef<number | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const [groups, setGroups] = useState<WebChangeGroup[]>([]);

  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const initialGeneration = generation.current + 1;
    generation.current = initialGeneration;
    baseline.current = null;
    let active = true;

    const isCurrent = (expectedGeneration: number): boolean =>
      active && mounted.current && generation.current === expectedGeneration;
    const poll = (): void => {
      const pollGeneration = generation.current;
      void pollChanges(readHead, baseline, () => isCurrent(pollGeneration), setGroups);
    };

    void Promise.resolve().then(() => {
      if (isCurrent(initialGeneration)) setGroups([]);
    });
    if (!enabled) {
      return () => {
        active = false;
      };
    }

    void readHead()
      .then((head) => {
        if (isCurrent(initialGeneration)) baseline.current = head.headSeq;
      })
      .catch(() => undefined);

    const stopWatching = watchVisibility(poll);

    return () => {
      active = false;
      stopWatching();
    };
  }, [baseline, enabled, generation, mounted, readHead, setGroups]);

  const reset = useCallback(async (): Promise<void> => {
    const currentGeneration = generation.current + 1;
    generation.current = currentGeneration;
    baseline.current = null;
    const head = await readHead();
    if (mounted.current && generation.current === currentGeneration) {
      baseline.current = head.headSeq;
      setGroups([]);
    }
  }, [readHead]);

  return { groups, reset };
}

/** Polls remote inventory changes while visible without replacing page data automatically. */
export function useChangedElsewhere(options: ChangedElsewhereOptions): ChangedElsewhere {
  const queryClient = useQueryClient();
  const { entityId, enabled = true, queryKeys } = options;
  const readHead = useHeadReader(queryClient, entityId);
  const { groups, reset } = useVisibilityPolling(enabled, readHead);

  const reload = useCallback(async (): Promise<void> => {
    for (const queryKey of queryKeys) {
      await queryClient.invalidateQueries({ queryKey, refetchType: 'active' });
    }
    await reset();
  }, [queryClient, queryKeys, reset]);

  return { groups, stale: groups.length > 0, reload };
}
