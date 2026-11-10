import { Badge } from '@pops/ui';

import { PlacementTitle } from './PlacementTitle';
import { RouteSourceRow } from './RouteSourceRow';

import type { JSX } from 'react';

import type { OverviewViewProps } from './types';

/** Complete paths retain order, gap ownership and alternative/applied state from the canonical route. */
export function OverviewPaths(props: OverviewViewProps): JSX.Element[] {
  return (props.projection?.paths ?? []).map(({ path, members }) => (
    <section
      key={path.id}
      aria-label={path.title || props.labels.source('path', path.id)}
      data-route-path-state={path.state}
      className="min-w-0 space-y-3 border-l-2 border-border pl-3"
    >
      <h3 className="break-words font-semibold">
        <PlacementTitle
          onOpenPlacement={props.onOpenPlacement}
          target={{ kind: 'path', id: path.id }}
          title={path.title || props.labels.source('path', path.id)}
        />
      </h3>
      <Badge variant="outline">
        {path.state === 'alternative' ? props.labels.alternatives : props.labels.status('applied')}
      </Badge>
      <p className="text-xs text-muted-foreground">{props.labels.source('gap', path.gapId)}</p>
      <ol>
        {members.map((item) => (
          <RouteSourceRow
            key={`${item.reference.kind}:${item.reference.id}`}
            {...props}
            item={item}
            historical={path.state === 'applied'}
          />
        ))}
      </ol>
    </section>
  ));
}
