import { useCallback, useMemo, useState } from 'react';

import { ErrorState } from '@pops/ui';

import { requestProblem } from '../stay/api';
import { OverviewJourneys, JourneyRecord } from './OverviewJourneys';
import { OverviewPaths } from './OverviewPaths';
import { OverviewSheet } from './OverviewSheet';
import { OverviewUnplaced } from './OverviewUnplaced';
import { PlacementTitle } from './PlacementTitle';
import { resolvedJourney } from './route-context';
import { RouteSourceRow } from './RouteSourceRow';
import { workspaceItemVisible } from './workspace-projection';

import type { JSX } from 'react';

import type { ProjectedRouteItem } from '../route/projection';
import type { OverviewViewProps, WorkspaceJourneyVisibility } from './types';

interface JourneyVisibilityResult {
  criteria: string;
  visible: boolean;
}

/** Renders the selected Trip's ordered route in the active Sheet or Journey presentation. */
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
  const items = (props.projection?.order ?? []).filter((item) =>
    workspaceItemVisible(item, props, journeyVisibility)
  );
  const display = props.workspaceDisplay ?? 'sheet';
  return (
    <>
      <section aria-label={props.labels.route} className="min-w-0 space-y-4">
        <h2 className="font-trip-display text-xl font-semibold">{props.labels.route}</h2>
        <RouteStatus {...props} />
        {display === 'sheet' ? (
          <OverviewSheet {...props} items={items} />
        ) : (
          <JourneyTimeline {...props} items={items} {...journeyVisibility} />
        )}
        {display === 'sheet' && (
          <JourneyVisibilityObservers {...props} items={items} {...journeyVisibility} />
        )}
        <OverviewPaths {...props} {...journeyVisibility} />
      </section>
      <OverviewUnplaced {...props} />
      <OverviewJourneys {...props} />
    </>
  );
}

function RouteStatus(props: OverviewViewProps): JSX.Element | null {
  if (props.route.reading) return <p role="status">{props.labels.loading}</p>;
  if (props.route.readError)
    return (
      <ErrorState
        error={requestProblem(props.route.readError)}
        onRetry={() => void props.route.reload()}
      />
    );
  return null;
}

function JourneyTimeline(
  props: OverviewViewProps & WorkspaceJourneyVisibility & { items: ProjectedRouteItem[] }
): JSX.Element | null {
  if (!props.projection && (props.route.reading || props.route.readError)) return null;
  if (props.projection?.order.length === 0)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {props.labels.empty}
      </p>
    );
  if (props.items.length === 0)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {noResultsLabel(props)}
      </p>
    );
  return (
    <ol aria-label={props.labels.route} data-workspace-display="journey" className="space-y-1">
      {props.items.map((item) =>
        item.state === 'gap' ? (
          <li
            key={`gap:${item.reference.id}`}
            data-route-kind="gap"
            data-route-id={item.reference.id}
            data-route-state="gap"
            className="mb-4 rounded-lg border bg-muted/30 p-3 text-muted-foreground"
          >
            <PlacementTitle
              onOpenPlacement={props.onOpenPlacement}
              target={item.reference}
              title={props.labels.source('gap', item.reference.id)}
            />
          </li>
        ) : (
          <RouteSourceRow
            key={`${item.reference.kind}:${item.reference.id}`}
            {...props}
            item={item}
          />
        )
      )}
    </ol>
  );
}

function JourneyVisibilityObservers(
  props: OverviewViewProps & WorkspaceJourneyVisibility & { items: ProjectedRouteItem[] }
): JSX.Element[] {
  return props.items.flatMap((item) =>
    resolvedJourney(item)
      ? [
          <JourneyRecord
            key={item.reference.id}
            {...props}
            journey={item.source}
            visibilityOnly
            onJourneyVisibilityChange={props.onJourneyVisibilityChange}
          />,
        ]
      : []
  );
}

function noResultsLabel(props: OverviewViewProps): string {
  return props.workspaceQuery?.trim() || (props.workspaceFilter ?? 'everything') !== 'everything'
    ? props.labels.status('workspace.noRouteResults')
    : props.labels.empty;
}
