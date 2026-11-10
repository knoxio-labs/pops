import { ArrowLeft, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { Button } from '@pops/ui';

import { boundaryLabel, parentTitle, placeTitle, tripTitle } from './model';

import type { Place, Trip, Visit } from '../api/types';

/** Read-only source facts for the selected trip; unavailable routes remain distinct from empty routes. */
export function TripPreview({
  trip,
  visits,
  allTrips,
  places,
  onBack,
}: {
  trip: Trip;
  visits: Visit[] | undefined;
  allTrips: Trip[];
  places: Place[];
  onBack: () => void;
}) {
  const { t, i18n } = useTranslation('trips');
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const parent = parentTitle(trip, allTrips, t('homeRows.unnamed'));
  return (
    <div className="space-y-5">
      <Button variant="ghost" className="min-h-11" onClick={onBack}>
        <ArrowLeft className="size-4" aria-hidden />
        {t('homeRows.back')}
      </Button>
      <header className="space-y-2">
        <h1 className="break-words text-2xl font-semibold">
          {tripTitle(trip, t('homeRows.unnamed'))}
        </h1>
        {trip.when && (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{trip.when}</p>
        )}
        <p className="text-sm text-muted-foreground">{boundaryLabel(visits, locale)}</p>
        {trip.parentId !== null && (
          <p className="text-xs text-muted-foreground">
            {t('homeRows.parentValue', { value: parent ?? t('homeRows.parentUnavailable') })}
          </p>
        )}
      </header>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" className="min-h-11">
          <a href={`/trips/${trip.id}/calendar`}>{t('calendar')}</a>
        </Button>
        <Button asChild variant="outline" className="min-h-11">
          <Link to={`/trips/${trip.id}/documents`}>
            <FileText className="size-4" aria-hidden />
            Documents
          </Link>
        </Button>
      </div>
      <PreviewRoute visits={visits} places={places} locale={locale} />
      {trip.notes && (
        <section className="space-y-2 rounded-xl border border-border bg-card p-4">
          <h2 className="text-base font-semibold">{t('homeRows.notes')}</h2>
          <p className="whitespace-pre-wrap break-words text-sm">{trip.notes}</p>
        </section>
      )}
    </div>
  );
}

function PreviewRoute({
  visits,
  places,
  locale,
}: {
  visits: Visit[] | undefined;
  places: Place[];
  locale: string;
}) {
  const { t } = useTranslation('trips');
  if (!visits?.length) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t(visits ? 'homeRows.noVisits' : 'homeRows.routeUnavailable')}
      </p>
    );
  }
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">{t('homeRows.route')}</h2>
      <ol className="divide-y divide-border rounded-xl border border-border bg-card">
        {visits.map((visit) => (
          <li key={visit.id} className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <Button
                asChild
                variant="ghost"
                className="min-h-11 whitespace-normal px-0 text-left font-medium"
              >
                <a
                  href={`/trips/${visit.tripId}/visits/${visit.id}`}
                  aria-label={t('homeRows.openVisit', {
                    name: placeTitle(visit.placeId, places, t('homeRows.placeUnavailable')),
                  })}
                >
                  {placeTitle(visit.placeId, places, t('homeRows.placeUnavailable'))}
                </a>
              </Button>
              <p className="text-xs text-muted-foreground">{t('homeRows.visit')}</p>
            </div>
            <p className="text-right text-xs text-muted-foreground">
              {boundaryLabel([visit], locale)}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
