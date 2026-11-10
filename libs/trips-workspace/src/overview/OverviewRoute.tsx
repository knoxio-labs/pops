import { ErrorState } from '@pops/ui';

import { requestProblem } from '../stay/api';
import { OverviewJourneys } from './OverviewJourneys';
import { OverviewPaths } from './OverviewPaths';
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
        <h2 className="border-b pb-2 text-lg font-semibold">{props.labels.route}</h2>
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
        {props.projection && (
          <ol aria-label={props.labels.route}>
            {props.projection.order.map((item) =>
              item.state === 'gap' ? (
                <li
                  key={`gap:${item.reference.id}`}
                  data-route-kind="gap"
                  data-route-id={item.reference.id}
                  data-route-state="gap"
                  className="mb-4 rounded-lg border border-dashed border-border p-3 text-muted-foreground"
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
        )}
        <OverviewPaths {...props} />
      </section>
      <OverviewUnplaced {...props} />
      <OverviewJourneys {...props} />
    </>
  );
}
