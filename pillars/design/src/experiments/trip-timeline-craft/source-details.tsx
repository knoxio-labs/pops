import { formatTripDate } from '@/fixtures/trip-overview-format';
import { tripPlaceName } from '@/fixtures/trip-places';

import { ArrangementMark } from './row-primitives';

import type { CraftDetailSource } from './model';

/** Render a supplied calendar date without moving its day, or leave it unset. */
export function date(value?: Parameters<typeof formatTripDate>[0]) {
  return value ? formatTripDate(value) : 'Not set';
}

/** Detail fields report only supplied source values; unknown coverage has no inferred cause. */
export function sourceDetails(source: CraftDetailSource): [string, string][] {
  if (source.kind === 'flight')
    return [
      ['From', tripPlaceName(source.departure.placeId)],
      [
        'Departure',
        [date(source.departure.date), source.departure.localTime, source.departure.timeZone]
          .filter(Boolean)
          .join(' · '),
      ],
      ['To', tripPlaceName(source.arrival.placeId)],
      [
        'Arrival',
        [date(source.arrival.date), source.arrival.localTime, source.arrival.timeZone]
          .filter(Boolean)
          .join(' · '),
      ],
      ['Airline', source.carrier ?? 'Not supplied'],
      ['Flight', source.service ?? 'Not supplied'],
      ['Handled by', source.handledBy ?? 'Not set'],
    ];
  if (source.kind === 'stay')
    return [
      ['Check-in', date(source.checkIn)],
      ['Check-out', date(source.checkOut)],
      ['Check-in time', 'Not supplied'],
      ['Check-out time', 'Not supplied'],
      ['Handled by', source.handledBy ?? 'Not set'],
    ];
  if (source.kind === 'activity')
    return [
      ['Date', date(source.date)],
      ['Time', source.localTime ?? 'Not supplied'],
      ['Timezone', source.timeZone ?? 'Not supplied'],
    ];
  return [
    ['Arrival', date(source.arrival)],
    ['Departure', date(source.departure)],
    ['Accommodation coverage', source.coverage === 'unknown' ? 'Unknown' : 'Shown in the Timeline'],
  ];
}

/** Name the selected source without adding a duplicate generic source heading. */
export function sourceTitle(source: CraftDetailSource) {
  if (source.kind === 'visit') return tripPlaceName(source.placeId);
  if (source.kind === 'flight')
    return `${tripPlaceName(source.departure.placeId)} → ${tripPlaceName(source.arrival.placeId)}`;
  return source.title;
}

/** Source details retain the supplied state, timezone fields and notes. */
export function CraftSourceDetails({ source }: { source: CraftDetailSource }) {
  return (
    <div className="space-y-6">
      {source.kind !== 'visit' && <ArrangementMark state={source.state} />}
      <dl className="space-y-4">
        {sourceDetails(source).map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="mt-1 break-words text-sm">{value}</dd>
          </div>
        ))}
      </dl>
      {source.notes && (
        <section className="border-t pt-5">
          <h3 className="mb-2 text-sm font-medium">Notes</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{source.notes}</p>
        </section>
      )}
    </div>
  );
}
