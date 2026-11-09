import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import { boundaryLabel, bucketFor, parentTitle, placeTitle, tripTitle } from './model';

import type { Place, Trip } from '../api/types';
import type { HomeBucket, HomeRecord } from './model';

const buckets: HomeBucket[] = ['current', 'upcoming', 'other', 'past'];

type RowSources = {
  allTrips: Trip[];
  places: Place[];
  onSelect: (id: number) => void;
};

/** Compact source-backed trip rows grouped by nonempty outer-date buckets. */
export function TripRows({
  records,
  referenceDate,
  ...sources
}: RowSources & {
  records: HomeRecord[];
  referenceDate: string;
}) {
  const { t } = useTranslation('trips');
  if (!records.length) return <p role="status">{t('homeRows.empty')}</p>;
  return (
    <div className="space-y-5">
      {buckets.map((bucket) => {
        const members = records.filter((record) => bucketFor(record, referenceDate) === bucket);
        if (!members.length) return null;
        return (
          <section key={bucket} aria-label={t(`homeRows.${bucket}`)} className="space-y-2">
            <h2 className="text-base font-semibold">{t(`homeRows.${bucket}`)}</h2>
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              {members.map((record) => (
                <TripRow key={record.trip.id} record={record} {...sources} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TripRow({
  record: { trip, visits },
  allTrips,
  places,
  onSelect,
}: RowSources & {
  record: HomeRecord;
}) {
  const { t, i18n } = useTranslation('trips');
  const title = tripTitle(trip, t('homeRows.unnamed'));
  const parent = parentTitle(trip, allTrips, t('homeRows.unnamed'));
  const route = visits?.map((visit) =>
    placeTitle(visit.placeId, places, t('homeRows.placeUnavailable'))
  );
  const routeLabel = route
    ?.filter((_, index) => route.length > 1 || route[index] !== title)
    .join(' → ');
  return (
    <Button
      variant="ghost"
      className="h-auto min-h-16 w-full justify-start gap-4 rounded-none border-b border-border px-4 py-3 text-left last:border-0"
      onClick={() => onSelect(trip.id)}
    >
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block break-words font-medium">{title}</span>
        {trip.when && (
          <span className="block whitespace-pre-wrap break-words text-sm font-normal text-muted-foreground">
            {trip.when}
          </span>
        )}
        {(visits === undefined || routeLabel) && (
          <span className="block whitespace-normal text-xs font-normal text-muted-foreground">
            {routeLabel ?? t('homeRows.routeUnavailable')}
          </span>
        )}
        {trip.parentId !== null && (
          <span className="block text-xs font-normal text-muted-foreground">
            {t('homeRows.parentValue', { value: parent ?? t('homeRows.parentUnavailable') })}
          </span>
        )}
      </span>
      <span className="text-right text-xs font-normal text-muted-foreground">
        {boundaryLabel(visits, i18n.resolvedLanguage ?? i18n.language)}
      </span>
      <ChevronRight className="size-4 shrink-0 text-app-accent" aria-hidden />
    </Button>
  );
}
