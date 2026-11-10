import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, TextInput } from '@pops/ui';

import { accommodationCoverage } from './coverage';
import { dateLabel, validDate } from './periods';
import { EventRow, StayRow } from './VisitSourceRows';
import { VisitTimelineRow } from './VisitTimelineRow';

import type { JSX } from 'react';

import type { AccommodationCoveragePeriod } from './coverage';
import type { AccommodationProjection } from './periods';
import type { Stay, TripEvent, Visit, VisitWorkspaceProps } from './types';

interface TimelineProps {
  visit: Visit;
  stays: Stay[];
  events: TripEvent[];
  identity: VisitWorkspaceProps;
  accommodationAvailable: boolean;
}
/** Compact accommodation periods; day focus accepts any date without mutating source dates. */
export function VisitTimeline(props: TimelineProps): JSX.Element {
  const { t } = useTranslation('trips');
  const [day, setDay] = useState('');
  const { visit, stays, events, identity, accommodationAvailable } = props;
  const projection = accommodationCoverage(visit, stays, events, accommodationAvailable);
  const periods = projection.periods.filter(
    (period) => !day || (day >= period.arrival && day < period.departure)
  );
  const visibleEvents = events.filter(
    (event) => event.visitId === visit.id && event.timing.start === day
  );
  return (
    <section aria-label={t('visitWorkspace.timeline')} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <Button
          variant={day ? 'ghost' : 'secondary'}
          aria-pressed={!day}
          onClick={() => setDay('')}
        >
          {t('visitWorkspace.wholeVisit')}
        </Button>
        <div className="w-44">
          <TextInput
            label={t('visitWorkspace.day')}
            type="date"
            className="min-h-11"
            value={day}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (!value || validDate(value)) setDay(value);
            }}
          />
        </div>
      </div>
      {periods.map((period) => (
        <PeriodRow
          key={`${period.arrival}:${period.departure}`}
          period={period}
          day={day}
          identity={identity}
          events={day ? visibleEvents : period.events}
        />
      ))}
      <UnplacedRows
        projection={projection}
        identity={identity}
        day={day}
        hasPeriod={periods.length > 0}
      />
    </section>
  );
}
function PeriodRow({
  period,
  day,
  identity,
  events,
}: {
  period: AccommodationCoveragePeriod;
  day: string;
  identity: VisitWorkspaceProps;
  events: TripEvent[];
}): JSX.Element {
  const { t, i18n } = useTranslation('trips');
  return (
    <VisitTimelineRow
      icon="stay"
      date={
        <>
          {dateLabel(period.arrival, i18n.resolvedLanguage ?? i18n.language)}
          <span className="block text-app-accent">↓</span>
          {dateLabel(period.departure, i18n.resolvedLanguage ?? i18n.language)}
        </>
      }
    >
      <div className="space-y-2">
        {period.stays.map((stay) => (
          <StayRow key={stay.id} stay={stay} identity={identity} />
        ))}
        {period.coverage.state === 'missing' &&
          (!day || (day >= period.coverage.arrival && day < period.coverage.departure)) && (
            <p className="text-sm text-muted-foreground">
              {t('visitWorkspace.noAccommodation', {
                arrival: dateLabel(period.coverage.arrival, i18n.resolvedLanguage ?? i18n.language),
                departure: dateLabel(
                  period.coverage.departure,
                  i18n.resolvedLanguage ?? i18n.language
                ),
              })}
            </p>
          )}
        {events.map((event) => (
          <EventRow key={event.id} event={event} identity={identity} />
        ))}
      </div>
    </VisitTimelineRow>
  );
}
function UnplacedRows({
  projection,
  identity,
  day,
  hasPeriod,
}: {
  projection: AccommodationProjection;
  identity: VisitWorkspaceProps;
  day: string;
  hasPeriod: boolean;
}): JSX.Element {
  const { i18n } = useTranslation('trips');
  const events = projection.unplacedEvents.filter(
    (event) => !day || (event.timing.start === day && !hasPeriod)
  );
  return (
    <>
      {!day &&
        projection.unplacedStays.map((stay) => (
          <VisitTimelineRow
            key={`stay:${stay.id}`}
            icon="stay"
            date={
              <>
                {dateLabel(stay.timing.arrival, i18n.resolvedLanguage ?? i18n.language)}
                {stay.timing.arrival && stay.timing.departure && <span className="block">↓</span>}
                {dateLabel(stay.timing.departure, i18n.resolvedLanguage ?? i18n.language)}
              </>
            }
          >
            <StayRow stay={stay} identity={identity} />
          </VisitTimelineRow>
        ))}
      {events.map((event) => (
        <VisitTimelineRow
          key={`event:${event.id}`}
          icon="event"
          date={dateLabel(event.timing.start, i18n.resolvedLanguage ?? i18n.language)}
        >
          <EventRow event={event} identity={identity} />
        </VisitTimelineRow>
      ))}
    </>
  );
}
