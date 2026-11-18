import { Fragment } from 'react';

import { Badge, TableCell, TableRow } from '@pops/ui';

import { captureTimelineSourceVisible } from '../capture/timeline-filters';
import { contextFacts, contextRecords } from './ContextSources';
import { dateRange, visitFacts, visitTiming } from './model';
import { overviewRentals } from './OverviewRentals';
import { OverviewSheetSourceRow } from './OverviewSheetSourceRow';
import { PlacementTitle } from './PlacementTitle';
import { resolvedJourney, resolvedVisit } from './route-context';

import type { JSX } from 'react';

import type { ProjectedRouteItem, ProjectedRouteSource } from '../route/projection';
import type { Stay } from '../stay/types';
import type { OverviewEvent, OverviewSource, OverviewViewProps } from './types';

/** Renders a route item as one compact record without guessing missing facts. */
export function OverviewSheetRow(
  props: OverviewViewProps & { item: ProjectedRouteItem }
): JSX.Element {
  const { item } = props;
  if (item.state === 'gap') return <GapRow {...props} item={item} />;
  if (resolvedVisit(item)) return <VisitRow {...props} item={item} />;
  if (resolvedJourney(item)) return <JourneyRow {...props} item={item} />;
  return <UnavailableRow {...props} item={item} />;
}

function GapRow(
  props: OverviewViewProps & { item: Extract<ProjectedRouteItem, { state: 'gap' }> }
): JSX.Element {
  return (
    <TableRow data-route-kind="gap" data-route-id={props.item.reference.id}>
      <TableCell className="text-muted-foreground">{props.labels.sheet.unknownDate}</TableCell>
      <TableCell className="whitespace-normal font-medium">
        <PlacementTitle
          onOpenPlacement={props.onOpenPlacement}
          target={props.item.reference}
          title={props.labels.source('gap', props.item.reference.id)}
        />
      </TableCell>
      <TableCell>
        <Badge variant="outline">{props.labels.sheet.gap}</Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">—</TableCell>
      <TableCell className="text-muted-foreground">—</TableCell>
    </TableRow>
  );
}

function VisitRow(
  props: OverviewViewProps & {
    item: Extract<ProjectedRouteSource, { state: 'resolved'; reference: { kind: 'visit' } }>;
  }
): JSX.Element {
  const { item } = props;
  const title =
    props.sources.places?.find((place) => place.id === item.source.placeId)?.name ??
    props.labels.source('place', item.source.placeId);
  const visitSource: OverviewSource = { kind: 'visit', id: item.source.id };
  return (
    <Fragment>
      <OverviewSheetSourceRow
        props={props}
        source={visitSource}
        title={title}
        when={visitTiming(item.source, props.locale, props.labels.status)}
        statuses={[]}
      />
      <VisitEntries {...props} visitId={item.source.id} />
    </Fragment>
  );
}

function VisitEntries(props: OverviewViewProps & { visitId: number }): JSX.Element {
  const facts = visitFacts(props.visitId, props.sources.stays ?? [], props.sources.events ?? []);
  const rentals = overviewRentals(props.sources, props.tripId).filter(
    (row) => row.visitId === props.visitId
  );
  return (
    <Fragment>
      {facts.stays
        .filter((stay) => stay.tripId === props.tripId)
        .map((stay) => (
          <OverviewSheetSourceRow
            key={`stay:${stay.id}`}
            props={props}
            source={{ kind: 'stay', id: stay.id }}
            title={stay.name ?? props.labels.source('stay', stay.id)}
            when={stayTiming(stay, props.locale)}
            statuses={stay.status ? [stay.status] : []}
          />
        ))}
      {facts.events
        .filter(
          (event) =>
            event.tripId === props.tripId &&
            captureTimelineSourceVisible(props.sourceVisibility, { kind: 'event', id: event.id })
        )
        .map((event) => (
          <OverviewSheetSourceRow
            key={`event:${event.id}`}
            props={props}
            source={{ kind: 'event', id: event.id }}
            title={event.name ?? props.labels.source('event', event.id)}
            when={eventTiming(event, props.locale)}
            statuses={[event.intention, event.arrangement, event.purchase].flatMap((value) =>
              value ? [value] : []
            )}
          />
        ))}
      {rentals.map((row) => (
        <OverviewSheetSourceRow
          key={`rental:${row.source.id}`}
          props={props}
          source={{ kind: 'rental', id: row.source.id }}
          title={row.source.provider ?? props.labels.source('rental', row.source.id)}
          when={
            dateRange(row.source.start ?? undefined, row.source.end ?? undefined, props.locale) ??
            ''
          }
          statuses={row.source.status ? [row.source.status] : []}
        />
      ))}
      <ContextEntries {...props} visitId={props.visitId} />
    </Fragment>
  );
}

function ContextEntries(props: OverviewViewProps & { visitId: number }): JSX.Element[] {
  return contextRecords(props.sources, props.tripId)
    .filter(
      (record) =>
        record.source.visitId === props.visitId &&
        captureTimelineSourceVisible(props.sourceVisibility, {
          kind: record.kind,
          id: record.source.id,
        })
    )
    .map((record) => {
      const facts = contextFacts(record, props);
      return (
        <OverviewSheetSourceRow
          key={`${record.kind}:${record.source.id}`}
          props={props}
          source={{ kind: record.kind, id: record.source.id }}
          title={facts.title}
          when={facts.timing ?? props.labels.sheet.unknownDate}
          statuses={facts.statuses.flatMap((status) => (status ? [status] : []))}
        />
      );
    });
}

function JourneyRow(
  props: OverviewViewProps & {
    item: Extract<ProjectedRouteSource, { state: 'resolved'; reference: { kind: 'journey' } }>;
  }
): JSX.Element {
  const name = props.item.source.name;
  return (
    <OverviewSheetSourceRow
      props={props}
      source={props.item.reference}
      title={
        name && name.trim().length > 0 ? name : props.labels.source('journey', props.item.source.id)
      }
      when={props.labels.sheet.unknownDate}
      statuses={[]}
    />
  );
}

function UnavailableRow(
  props: OverviewViewProps & { item: Exclude<ProjectedRouteSource, { state: 'resolved' }> }
): JSX.Element {
  const source = props.item.reference;
  const state = props.item.state === 'missing' ? props.labels.unresolved : props.labels.unavailable;
  return (
    <OverviewSheetSourceRow
      props={props}
      source={source}
      title={props.labels.source(source.kind, source.id)}
      when={props.labels.sheet.unknownDate}
      statuses={[state]}
    />
  );
}

function stayTiming(stay: Stay, locale: string): string {
  const range = dateRange(stay.timing.arrival, stay.timing.departure, locale);
  const details = [stay.timing.checkIn, stay.timing.checkOut, stay.timing.timeZone]
    .filter(Boolean)
    .join(' · ');
  return [range, details].filter(Boolean).join(' · ');
}

function eventTiming(event: OverviewEvent, locale: string): string {
  const range = dateRange(event.timing.start, event.timing.end, locale);
  const details = [event.timing.startTime, event.timing.endTime, event.timing.timeZone]
    .filter(Boolean)
    .join(' · ');
  return [range, details].filter(Boolean).join(' · ');
}
