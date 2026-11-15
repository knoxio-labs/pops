import { MapPin } from 'lucide-react';

import { Button } from '@pops/ui';

import { visitTiming } from './model';
import { sourceAction } from './source-action';
import { VisitFacts } from './VisitFacts';

import type { JSX } from 'react';

import type { Visit } from '../stay/types';
import type { OverviewViewProps } from './types';

/** One canonical Visit occurrence retains independent source facts without guessing placement. */
export function OverviewVisit({
  visit,
  ...props
}: OverviewViewProps & { visit: Visit }): JSX.Element {
  const title =
    props.sources.places?.find((place) => place.id === visit.placeId)?.name ??
    props.labels.source('place', visit.placeId);
  return (
    <li
      data-visit-id={visit.id}
      data-route-kind="visit"
      data-route-id={visit.id}
      data-route-state="resolved"
      className="mb-4 min-w-0 overflow-hidden rounded-2xl border border-trip-line bg-trip-surface"
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-trip-sunken/40 px-4 py-2">
        <span className="flex min-w-0 items-center gap-2">
          <MapPin className="size-4 shrink-0 text-trip-transport" aria-hidden />
          <VisitTitle {...props} id={visit.id} title={title} />
        </span>
        <p className="break-words text-xs font-medium text-muted-foreground">
          {visitTiming(visit, props.locale, props.labels.status)}
        </p>
      </div>
      <div className="min-w-0 space-y-0">
        {visit.notes && (
          <p className="whitespace-pre-wrap break-words px-4 py-2 text-xs leading-relaxed text-muted-foreground">
            {visit.notes}
          </p>
        )}
        <VisitFacts {...props} visitId={visit.id} />
        {visit.tripId === props.tripId && props.renderVisitContext && (
          <div className="px-4 py-3">
            {props.renderVisitContext({ tripId: props.tripId, visitId: visit.id })}
          </div>
        )}
      </div>
    </li>
  );
}

function VisitTitle(props: OverviewViewProps & { id: number; title: string }): JSX.Element {
  const action = sourceAction(props, { kind: 'visit', id: props.id });
  const className =
    'h-auto min-h-11 justify-start whitespace-normal px-0 text-left font-trip-display text-base font-semibold';
  let content: JSX.Element;
  if (action.onOpen)
    content = (
      <Button variant="ghost" onClick={action.onOpen} className={className}>
        {props.title}
      </Button>
    );
  else if (action.href)
    content = (
      <Button asChild variant="ghost" className={className}>
        <a href={action.href}>{props.title}</a>
      </Button>
    );
  else content = <>{props.title}</>;
  return <h3 className="break-words text-lg font-semibold">{content}</h3>;
}
