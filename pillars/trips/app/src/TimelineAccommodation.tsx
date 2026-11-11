import { useTranslation } from 'react-i18next';

import { AccommodationGapContext, formatTripDate } from '@pops/trips-workspace';

import { useArrangementLabels } from './arrangements/use-arrangement-labels';

import type { TripOverviewProps } from '@pops/trips-workspace';

import type { TimelineContextProps } from './timeline-context-types';

type AccommodationProps = Pick<TimelineContextProps, 'tripId' | 'client' | 'onSelect'> & {
  visitId: number;
};

/** Bind resolved Visit contexts to the current host Trip and its guarded source opener. */
export function accommodationContext(
  props: Omit<AccommodationProps, 'visitId'>
): NonNullable<TripOverviewProps['renderVisitContext']> {
  return (owner) =>
    owner.tripId === props.tripId ? (
      <TimelineAccommodation {...props} visitId={owner.visitId} />
    ) : null;
}

/** Reuse canonical coverage and creation at one exact Visit, opening only its acknowledged Stay. */
export function TimelineAccommodation({ tripId, visitId, client, onSelect }: AccommodationProps) {
  const labels = useArrangementLabels();
  const { i18n } = useTranslation('trips');
  const locale = i18n.resolvedLanguage ?? i18n.language;
  return (
    <AccommodationGapContext
      identity={{ tripId, client }}
      visitId={visitId}
      labels={labels}
      formatDate={(value) => formatTripDate(value, locale)}
      onOpenStay={(created) => {
        if (created.tripId === tripId && created.visitId === visitId)
          onSelect({ kind: 'source', source: { kind: 'stay', id: created.stayId } });
      }}
    />
  );
}
