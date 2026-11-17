import { ErrorState, Tabs, TabsContent, TabsList, TabsTrigger } from '@pops/ui';

import { requestProblem } from '../stay/api';
import { OverviewJourneys } from './OverviewJourneys';
import { OverviewPaths } from './OverviewPaths';
import { OverviewSheet } from './OverviewSheet';
import { OverviewUnplaced } from './OverviewUnplaced';
import { PlacementTitle } from './PlacementTitle';
import { RouteSourceRow } from './RouteSourceRow';

import type { JSX } from 'react';

import type { OverviewViewProps } from './types';

/** Canonical mixed root order, gaps and complete paths come only from the shared route projector. */
export function OverviewRoute(props: OverviewViewProps): JSX.Element {
  return (
    <>
      <section aria-label={props.labels.route} className="min-w-0 space-y-4">
        <Tabs defaultValue="sheet" className="min-w-0">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-2">
            <h2 className="text-lg font-semibold">{props.labels.route}</h2>
            <TabsList aria-label={props.labels.route}>
              <TabsTrigger value="sheet" className="min-h-11">
                {props.labels.sheet.title}
              </TabsTrigger>
              <TabsTrigger value="journey" className="min-h-11">
                {props.labels.sheet.journey}
              </TabsTrigger>
            </TabsList>
          </header>
          <RouteStatus {...props} />
          {props.projection && (
            <>
              <TabsContent value="sheet" className="min-w-0">
                <OverviewSheet {...props} />
              </TabsContent>
              <TabsContent value="journey" className="min-w-0">
                <JourneyTimeline {...props} />
              </TabsContent>
            </>
          )}
        </Tabs>
        <OverviewPaths {...props} />
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

function JourneyTimeline(props: OverviewViewProps): JSX.Element {
  const items = props.projection?.order ?? [];
  if (items.length === 0)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {props.labels.empty}
      </p>
    );
  return (
    <ol aria-label={props.labels.route} className="space-y-1">
      {items.map((item) =>
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
