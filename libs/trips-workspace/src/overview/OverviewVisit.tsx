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
      className="grid min-w-0 grid-cols-1 gap-2 pb-5 sm:grid-cols-4 sm:gap-4"
    >
      <p className="min-w-0 break-words pl-10 text-xs font-medium text-muted-foreground sm:pl-0 sm:pt-3 sm:text-right">
        {visitTiming(visit, props.locale, props.labels.status)}
      </p>
      <div className="relative min-w-0 border-l border-dotted border-border pl-5 sm:col-span-3">
        <span className="absolute -left-4 top-2 flex size-8 items-center justify-center rounded-full border border-border bg-background">
          <MapPin className="size-4 text-app-accent" aria-hidden />
        </span>
        <div className="min-w-0 space-y-3 rounded-lg border border-dashed border-border p-3">
          <VisitTitle {...props} id={visit.id} title={title} />
          {visit.notes && (
            <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
              {visit.notes}
            </p>
          )}
          <VisitFacts {...props} visitId={visit.id} />
        </div>
      </div>
    </li>
  );
}

function VisitTitle(props: OverviewViewProps & { id: number; title: string }): JSX.Element {
  const action = sourceAction(props, { kind: 'visit', id: props.id });
  const className = 'h-auto min-h-11 w-full justify-start whitespace-normal px-0 text-left text-lg';
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
