import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { showUndoToast } from '../../foundation/feedback/undo-toast.js';
import { toItemRowModel } from '../../inventory-web/item-row-model.js';
import { useBulkItemVerbs } from '../../inventory-web/item-verbs-bulk.js';
import { dismissType } from '../../inventory-web/type-arrivals.js';
import { useCatalogueLookups } from '../../inventory-web/useCatalogueLookups.js';
import { usePlacementSources } from '../../inventory-web/usePlacementSources.js';
import { useWebItems } from '../../inventory-web/useWebItems.js';
import {
  appliedMessage,
  tickReducer,
  type ArrivedType,
  type TickAction,
  type TypeArrivedStage,
  type UntypedItem,
} from './type-arrived-model.js';

import type { Dispatch, SetStateAction } from 'react';

import type { WebListResponses } from '../../inventory-api/types.gen.js';

type WebItemsPage = WebListResponses['200'] & {
  readonly deletedPreviousPlaces?: Readonly<
    Record<string, { readonly kind: 'location' | 'container'; readonly name: string }>
  >;
};

const EMPTY_PAGES: readonly WebItemsPage[] = [];

function deletedPreviousPlaceNames(pages: readonly WebItemsPage[]): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const page of pages) {
    for (const [id, place] of Object.entries(page.deletedPreviousPlaces ?? {})) {
      names.set(id, place.name);
    }
  }
  return names;
}

/** Loads every server-matched item page and initializes all matches as ticked. */
export function useTypeArrivedData(type: ArrivedType) {
  const catalogue = useCatalogueLookups();
  const itemQuery = useWebItems({ legacyLabelOf: type.key, untyped: 'true' }, 200);
  const placement = usePlacementSources({ kind: 'items', ids: [] as const });
  const pages: readonly WebItemsPage[] = itemQuery.data?.pages ?? EMPTY_PAGES;
  const deletedPreviousPlaces = useMemo(() => deletedPreviousPlaceNames(pages), [pages]);
  const matches = useMemo<UntypedItem[]>(
    () =>
      pages.flatMap((page) =>
        page.items.map((item) => ({
          item: toItemRowModel(item, {
            typeNames: catalogue.typeNameById,
            deletedPreviousPlaces,
          }),
          legacyLabel: item.legacyType ?? '',
        }))
      ),
    [catalogue.typeNameById, deletedPreviousPlaces, pages]
  );
  const { fetchNextPage, hasNextPage, isFetchingNextPage, status } = itemQuery;
  const ready = status === 'success' && !hasNextPage && !isFetchingNextPage;

  useEffect(() => {
    if (status === 'success' && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, status]);

  const initialized = useRef(false);
  const matchIds = useMemo(() => matches.map(({ item }) => item.id), [matches]);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    if (!ready || initialized.current) return;
    initialized.current = true;
    setTicked(new Set(matchIds));
  }, [matchIds, ready]);

  return {
    itemQuery,
    placement,
    ready,
    matches,
    matchIds,
    ticked,
    setTicked,
    retry: () => {
      void itemQuery.refetch();
    },
  };
}

/** Actions and state transitions for review, apply, undo, and Not now. */
export interface TypeArrivedActions {
  stage: TypeArrivedStage;
  applying: boolean;
  applyError: string | null;
  appliedIds: ReadonlySet<string>;
  apply: () => Promise<void>;
  onNotNow: () => void;
  toggle: (action: TickAction) => void;
}

/** Builds the guarded bulk action and selection handlers for the page. */
export function useTypeArrivedActions(
  type: ArrivedType,
  matchIds: readonly string[],
  ticked: ReadonlySet<string>,
  setTicked: Dispatch<SetStateAction<ReadonlySet<string>>>
): TypeArrivedActions {
  const bulk = useBulkItemVerbs();
  const [stage, setStage] = useState<TypeArrivedActions['stage']>('review');
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<ReadonlySet<string>>(() => new Set());
  const apply = useCallback(async () => {
    if (ticked.size === 0 || applying) return;
    setApplying(true);
    setApplyError(null);
    try {
      const result = await bulk.changeType(
        matchIds.filter((id) => ticked.has(id)),
        type.key
      );
      if (result.applied.length === 0) {
        setApplyError('No items could be typed. They may have changed since this review.');
        return;
      }
      const applied = new Set(result.applied);
      setTicked(applied);
      setAppliedIds(applied);
      dismissType(type.id);
      setStage('applied');
      if (result.undo !== null) {
        showUndoToast({
          concept: 'type',
          message: appliedMessage(result.applied.length, type.name),
          onUndo: result.undo,
        });
      }
    } catch {
      setApplyError('Some items could not be typed. Nothing else was changed.');
    } finally {
      setApplying(false);
    }
  }, [applying, bulk, matchIds, setTicked, ticked, type]);
  const onNotNow = useCallback(() => {
    dismissType(type.id);
    setStage('not-now');
  }, [type.id]);
  const toggle = useCallback(
    (action: TickAction) => setTicked((current) => tickReducer(current, action)),
    [setTicked]
  );

  return { stage, applying, applyError, appliedIds, apply, onNotNow, toggle };
}
