import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import {
  OFFLINE_REASON,
  OFFLINE_TITLE,
  StateBanner,
} from '../../foundation/feedback/state-banner.js';
import { useChangedElsewhere } from '../../inventory-web/useChangedElsewhere.js';
import { WEB_MOVING_DAY_QUERY_KEY, useMovingDay } from '../../inventory-web/useMovingDay.js';
import { useOnline } from '../../inventory-web/useOnline.js';
import { usePlacementSources } from '../../inventory-web/usePlacementSources.js';
import { labelsHref } from '../labels-page/label-params.js';
import {
  actionDisabledReason,
  useMovingDayActions,
  type MovingDayActions,
} from './moving-day-actions.js';
import {
  isMoveDone,
  movingItemIds,
  staleDetail,
  staleTitle,
  type MovingBox,
  type MovingDayData,
  type MovingDayView,
} from './moving-day-model.js';

import type { ReactElement } from 'react';

import type { PlacementTarget } from '../../foundation/model/model.js';

/** The body states owned by the moving-day aggregate. */
export type MovingDayBodyState = 'loading' | 'error' | 'empty' | 'done' | 'board';

/** The complete read, view, mutation, and overlay state for the moving-day page. */
export interface MovingDayPageModel {
  readonly navigate: ReturnType<typeof useNavigate>;
  readonly online: boolean;
  readonly data: MovingDayData | undefined;
  readonly body: MovingDayBodyState;
  readonly banner: ReactElement | null;
  readonly placement: ReturnType<typeof usePlacementSources>;
  readonly actions: MovingDayActions;
  readonly disabledReason: string | undefined;
  readonly view: MovingDayView;
  readonly setView: (view: MovingDayView) => void;
  readonly query: string;
  readonly setQuery: (query: string) => void;
  readonly openBoxId: string | null;
  readonly setOpenBoxId: (id: string | null) => void;
  readonly openBox: MovingBox | null;
  readonly packingIds: readonly string[];
  readonly setPackingIds: (ids: readonly string[]) => void;
  readonly recents: readonly PlacementTarget[];
  readonly printLabels: (() => void) | undefined;
  readonly retry: () => void;
  readonly newBox: () => void;
}

function bodyState(
  status: 'pending' | 'error' | 'success',
  data: MovingDayData | undefined
): MovingDayBodyState {
  if (status === 'pending') return 'loading';
  if (status === 'error' || data === undefined) return 'error';
  if (data.boxes.length === 0) return 'empty';
  return isMoveDone(data) ? 'done' : 'board';
}

function pageBanner(
  online: boolean,
  changed: ReturnType<typeof useChangedElsewhere>,
  retry: () => void
): ReactElement | null {
  if (!online) {
    return (
      <StateBanner
        kind="offline"
        title={OFFLINE_TITLE}
        detail={OFFLINE_REASON}
        actionLabel="Retry"
        onAction={retry}
      />
    );
  }
  if (!changed.stale) return null;
  return (
    <StateBanner
      kind="stale"
      title={staleTitle(changed.groups)}
      detail={staleDetail(changed.groups)}
      actionLabel="Reload"
      onAction={() => void changed.reload()}
    />
  );
}

function labelRoute(
  data: MovingDayData | undefined,
  navigate: ReturnType<typeof useNavigate>
): (() => void) | undefined {
  if (data === undefined) return undefined;
  const ids = data.boxes
    .filter((box) => box.stage === 'closed' && box.code === null)
    .map((box) => box.id);
  return ids.length === 0 ? undefined : () => void navigate(labelsHref(ids));
}

/** Loads moving-day data and binds its existing inventory mutation surfaces. */
export function useMovingDayPageModel(): MovingDayPageModel {
  const navigate = useNavigate();
  const online = useOnline();
  const moving = useMovingDay();
  const changed = useChangedElsewhere({
    queryKeys: [WEB_MOVING_DAY_QUERY_KEY],
    enabled: moving.status === 'success',
  });
  const [view, setView] = useState<MovingDayView>('stage');
  const [query, setQuery] = useState('');
  const [openBoxId, setOpenBoxId] = useState<string | null>(null);
  const [packingIds, setPackingIds] = useState<readonly string[]>([]);
  const data = moving.data;
  const ids = useMemo(() => (data === undefined ? [] : movingItemIds(data)), [data]);
  const subject = useMemo(() => ({ kind: 'items' as const, ids }), [ids]);
  const placement = usePlacementSources(subject);
  const ready = !placement.isLoading && !placement.isError;
  const actions = useMovingDayActions({ online, ready, world: placement.world });
  const retry = (): void => {
    void moving.refetch();
  };
  const recents = useMemo<PlacementTarget[]>(
    () =>
      (data?.boxes ?? [])
        .filter((box) => box.stage !== 'closed')
        .map((box) => ({ kind: 'container', containerId: box.id })),
    [data?.boxes]
  );
  return {
    navigate,
    online,
    data,
    body: bodyState(moving.status, data),
    banner: pageBanner(online, changed, retry),
    placement,
    actions,
    disabledReason: actionDisabledReason(online, ready),
    view,
    setView,
    query,
    setQuery,
    openBoxId,
    setOpenBoxId,
    openBox: data?.boxes.find((box) => box.id === openBoxId) ?? null,
    packingIds,
    setPackingIds,
    recents,
    printLabels: labelRoute(data, navigate),
    retry,
    newBox: () => void navigate('/inventory/items/new'),
  };
}
