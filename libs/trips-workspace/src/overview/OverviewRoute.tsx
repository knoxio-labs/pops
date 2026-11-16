import { useCallback, useMemo, useState } from 'react';

import { ErrorState } from '@pops/ui';

import { requestProblem } from '../stay/api';
import { OverviewJourneys } from './OverviewJourneys';
import { OverviewPaths } from './OverviewPaths';
import { OverviewUnplaced } from './OverviewUnplaced';
import { PlacementTitle } from './PlacementTitle';
import { RouteSourceRow } from './RouteSourceRow';
import { workspaceItemVisible } from './workspace-projection';

import type { JSX } from 'react';

import type { ProjectedRouteItem } from '../route/projection';
import type { OverviewViewProps, WorkspaceJourneyVisibility } from './types';

interface JourneyVisibilityResult {
  criteria: string;
  visible: boolean;
}

/** Canonical mixed root order, gaps and complete paths come only from the shared route projector. */
export function OverviewRoute(props: OverviewViewProps): JSX.Element {
  const criteria = JSON.stringify([
    props.workspaceFilter ?? 'everything',
    props.workspaceQuery?.trim().toLowerCase() ?? '',
  ]);
  const [journeyResults, setJourneyResults] = useState<
    ReadonlyMap<number, JourneyVisibilityResult>
  >(() => new Map());
  const hiddenJourneyIds = useMemo(
    () =>
      new Set(
        [...journeyResults]
          .filter(([, result]) => result.criteria === criteria && !result.visible)
          .map(([journeyId]) => journeyId)
      ),
    [criteria, journeyResults]
  );
  const onJourneyVisibilityChange = useCallback(
    (journeyId: number, visible: boolean) => {
      setJourneyResults((current) => {
        const previous = current.get(journeyId);
        if (previous?.criteria === criteria && previous.visible === visible) return current;
        const next = new Map(current);
        next.set(journeyId, { criteria, visible });
        return next;
      });
    },
    [criteria]
  );
  const journeyVisibility: WorkspaceJourneyVisibility = {
    hiddenJourneyIds,
    onJourneyVisibilityChange,
  };
  return (
    <>
      <section aria-label={props.labels.route} className="min-w-0 space-y-4">
        <h2 className="font-trip-display text-xl font-semibold">{props.labels.route}</h2>
        <WorkspaceColumns {...props} />
        <RouteReadState {...props} />
        <RouteItems {...props} {...journeyVisibility} />
        <OverviewPaths {...props} {...journeyVisibility} />
      </section>
      <OverviewUnplaced {...props} />
      <OverviewJourneys {...props} />
    </>
  );
}

function RouteReadState(props: OverviewViewProps): JSX.Element {
  return (
    <>
      {props.route.reading && <p role="status">{props.labels.loading}</p>}
      {props.route.readError && (
        <ErrorState
          error={requestProblem(props.route.readError)}
          onRetry={() => void props.route.reload()}
        />
      )}
      {props.projection?.order.length === 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          {props.labels.empty}
        </p>
      )}
    </>
  );
}

function RouteItems(props: OverviewViewProps & WorkspaceJourneyVisibility): JSX.Element | null {
  const items = (props.projection?.order ?? []).filter((item) =>
    workspaceItemVisible(item, props, props)
  );
  if (!props.projection?.order.length) return null;
  if (!items.length)
    return (
      <p role="status" className="rounded-xl bg-trip-surface p-4 text-sm text-trip-muted">
        {props.workspaceQuery?.trim() || (props.workspaceFilter ?? 'everything') !== 'everything'
          ? props.labels.status('workspace.noRouteResults')
          : props.labels.empty}
      </p>
    );
  return (
    <ol
      aria-label={props.labels.route}
      data-workspace-display={props.workspaceDisplay ?? 'sheet'}
      className={
        props.workspaceDisplay === 'journey'
          ? 'space-y-5 border-l-2 border-trip-transport/40 pl-4'
          : 'space-y-1'
      }
    >
      {items.map((item) => (
        <RouteItem key={`${item.reference.kind}:${item.reference.id}`} {...props} item={item} />
      ))}
    </ol>
  );
}

function RouteItem(
  props: OverviewViewProps & WorkspaceJourneyVisibility & { item: ProjectedRouteItem }
): JSX.Element {
  if (props.item.state !== 'gap') return <RouteSourceRow {...props} item={props.item} />;
  return (
    <li
      data-route-kind="gap"
      data-route-id={props.item.reference.id}
      data-route-state="gap"
      className="min-w-0 rounded-xl border border-dashed border-trip-attention/50 bg-trip-attention-soft/40 p-4 text-trip-muted"
    >
      <PlacementTitle
        onOpenPlacement={props.onOpenPlacement}
        target={props.item.reference}
        title={props.labels.source('gap', props.item.reference.id)}
      />
    </li>
  );
}

function WorkspaceColumns(props: OverviewViewProps): JSX.Element {
  return (
    <div
      aria-hidden
      className={
        props.workspaceDisplay === 'journey'
          ? 'hidden'
          : 'hidden grid-cols-12 gap-3 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground lg:grid'
      }
    >
      {(['when', 'what', 'state', 'with', 'originals'] as const).map((column) => (
        <span key={column} className={column === 'what' ? 'col-span-4' : 'col-span-2'}>
          {props.labels.status(`workspace.${column}`)}
        </span>
      ))}
    </div>
  );
}
