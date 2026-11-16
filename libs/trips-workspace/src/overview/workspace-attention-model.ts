import { AlertTriangle, CalendarDays, Moon, Route } from 'lucide-react';

import { accommodationCoverage } from '../visit/coverage';
import { calendarDaysBetween } from './workspace-date';

import type { LucideIcon } from 'lucide-react';

import type { OverviewViewProps } from './types';

export interface WorkspaceAttentionItem {
  key: string;
  icon: LucideIcon;
  count: number;
  title: string;
  detail: string;
}

/** Build attention summaries only from recorded route, date and accommodation facts. */
export function workspaceAttentionModel(props: OverviewViewProps): {
  items: WorkspaceAttentionItem[];
  hasVisits: boolean;
} {
  const visits = props.sources.visits?.filter((visit) => visit.tripId === props.tripId) ?? [];
  const items = [
    openNightsItem(props, visits),
    routeGapsItem(props),
    undatedVisitsItem(props, visits),
    unresolvedItems(props),
  ].filter((item): item is WorkspaceAttentionItem => item !== undefined);
  return { items, hasVisits: visits.length > 0 };
}

function openNightsItem(
  props: OverviewViewProps,
  visits: NonNullable<OverviewViewProps['sources']['visits']>
): WorkspaceAttentionItem | undefined {
  const stays = (props.sources.stays ?? []).filter((stay) => stay.tripId === props.tripId);
  const events = (props.sources.events ?? []).filter((event) => event.tripId === props.tripId);
  const count = visits.reduce((total, visit) => {
    const coverage = accommodationCoverage(visit, stays, events, props.accommodationComplete);
    return (
      total +
      coverage.periods.reduce(
        (nights, period) =>
          nights +
          (period.coverage.state === 'missing'
            ? calendarDaysBetween(period.arrival, period.departure)
            : 0),
        0
      )
    );
  }, 0);
  return count > 0
    ? {
        key: 'open-nights',
        icon: Moon,
        count,
        title: props.labels.status('workspace.openNights'),
        detail: props.labels.status('workspace.nightCoverage'),
      }
    : undefined;
}

function routeGapsItem(props: OverviewViewProps): WorkspaceAttentionItem | undefined {
  const gaps = (props.projection?.order ?? []).filter((item) => item.state === 'gap');
  return gaps.length
    ? {
        key: 'route-gaps',
        icon: Route,
        count: gaps.length,
        title: props.labels.status('workspace.routeGaps'),
        detail: gaps.map((item) => props.labels.source('gap', item.reference.id)).join(' · '),
      }
    : undefined;
}

function undatedVisitsItem(
  props: OverviewViewProps,
  visits: NonNullable<OverviewViewProps['sources']['visits']>
): WorkspaceAttentionItem | undefined {
  const undated = visits.filter((visit) => !visit.timing.arrival || !visit.timing.departure);
  return undated.length
    ? {
        key: 'undated-visits',
        icon: CalendarDays,
        count: undated.length,
        title: props.labels.status('workspace.datesOpen'),
        detail: undated
          .map((visit) => {
            const place = props.sources.places?.find((item) => item.id === visit.placeId);
            return place?.name ?? props.labels.source('visit', visit.id);
          })
          .join(' · '),
      }
    : undefined;
}

function unresolvedItems(props: OverviewViewProps): WorkspaceAttentionItem | undefined {
  const unresolved = (props.projection?.order ?? []).filter(
    (item) => item.state === 'missing' || item.state === 'unavailable'
  );
  return unresolved.length
    ? {
        key: 'unresolved-references',
        icon: AlertTriangle,
        count: unresolved.length,
        title: props.labels.status('workspace.referencesNeedReview'),
        detail: unresolved
          .map((item) => props.labels.source(item.reference.kind, item.reference.id))
          .join(' · '),
      }
    : undefined;
}
