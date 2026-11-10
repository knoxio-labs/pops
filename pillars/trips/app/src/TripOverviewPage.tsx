import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { TripOverview } from '@pops/trips-workspace';
import { ErrorState } from '@pops/ui';

import { sourceId } from './source-id';

import type { OverviewKind, OverviewLabels } from '@pops/trips-workspace';

/** Published overview adapter supplies translations and literal approved source routes. */
export function TripOverviewPage() {
  const params = useParams();
  const tripId = sourceId(params.tripId);
  const { t, i18n } = useTranslation('trips');
  if (tripId === undefined)
    return (
      <ErrorState
        error={{ code: 'trips.identity.invalid', message: t('overview.invalid'), retryable: false }}
      />
    );
  const labels: OverviewLabels = {
    trip: t('trip'),
    route: t('overview.route'),
    journeys: t('overview.journeys'),
    unassociated: t('overview.unassociated'),
    decisions: t('overview.decisions'),
    documents: t('overview.documents'),
    notes: t('notes'),
    empty: t('overview.empty'),
    loading: t('overview.loading'),
    unavailable: t('overview.unavailable'),
    retry: t('retry'),
    settings: t('settings'),
    current: t('overview.current'),
    alternatives: t('overview.alternatives'),
    selected: t('overview.selected'),
    unresolved: t('overview.unresolved'),
    source: (kind, id) => t('overview.source', { kind: t(`overview.kinds.${kind}`), id }),
    status: (value) => t(`overview.status.${value}`, { defaultValue: value }),
  };
  const href = (kind: OverviewKind, id: number) => {
    switch (kind) {
      case 'visit':
        return `/trips/${tripId}/visits/${id}`;
      case 'stay':
        return `/trips/${tripId}/stays/${id}`;
      case 'event':
        return `/trips/${tripId}/events/${id}`;
      case 'journey':
        return `/trips/${tripId}/journeys/${id}`;
      case 'decision':
        return `/trips/${tripId}/decisions/${id}`;
      default:
        return undefined;
    }
  };
  return (
    <TripOverview
      tripId={tripId}
      locale={i18n.resolvedLanguage ?? i18n.language}
      labels={labels}
      backHref="/trips"
      documentsHref={`/trips/${tripId}/documents`}
      settingsHref={`/trips/${tripId}/settings`}
      calendarLink={{ href: `/trips/${tripId}/calendar`, label: t('calendar') }}
      href={href}
    />
  );
}
