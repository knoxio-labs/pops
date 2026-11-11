import { useTranslation } from 'react-i18next';

import {
  ArrangementResponsibilityField,
  DecisionWorkspace,
  EventWorkspace,
  JourneyWorkspace,
  StayWorkspace,
  VisitWorkspace,
} from '@pops/trips-workspace';

import { useArrangementLabels } from './arrangements/use-arrangement-labels';
import { CaptureContext } from './CaptureContext';
import { PeopleContext } from './PeopleContext';
import { TimelineRental } from './TimelineRental';
import { TimelineSourcePlacement } from './TimelineSourcePlacement';

import type { ArrangementTarget, OverviewSource } from '@pops/trips-workspace';

import type { TimelineContextProps } from './timeline-context-types';

/** Compose canonical source fields, literal placement and whole-source responsibility controls. */
export function TimelineSourceContext(
  props: Omit<TimelineContextProps, 'selection'> & { source: OverviewSource }
) {
  const labels = useArrangementLabels();
  const { source, tripId, client, contacts, contactChooserIntent, advanceContactChooserIntent } =
    props;
  const target = responsibilityTarget(source);
  return (
    <>
      <SourceContent {...props} />
      {(source.kind === 'visit' || source.kind === 'journey') && (
        <TimelineSourcePlacement identity={{ tripId, client }} source={source} />
      )}
      {target && (
        <ArrangementResponsibilityField
          identity={{
            tripId,
            client,
            labels,
            contacts,
            contactChooserIntent,
            advanceContactChooserIntent,
          }}
          target={target}
        />
      )}
    </>
  );
}

function responsibilityTarget(source: OverviewSource): ArrangementTarget | undefined {
  switch (source.kind) {
    case 'journey':
    case 'stay':
    case 'event':
    case 'rental':
      return { targetKind: source.kind, targetId: source.id };
    default:
      return undefined;
  }
}

function SourceContent(
  props: Omit<TimelineContextProps, 'selection'> & { source: OverviewSource }
) {
  const { tripId, client, contacts, documentsClient, source, onSelect } = props;
  const { t } = useTranslation('trips');
  const open = (source: OverviewSource) => onSelect({ kind: 'source', source });
  const identity = { tripId, client };
  switch (source.kind) {
    case 'visit':
      return (
        <VisitWorkspace
          {...identity}
          visitId={source.id}
          onViewVisit={(id) => open({ kind: 'visit', id })}
          onViewStay={(id) => open({ kind: 'stay', id })}
          onViewEvent={(id) => onSelect({ kind: 'source', source: { kind: 'event', id } })}
        />
      );
    case 'stay':
      return (
        <StayWorkspace
          {...identity}
          stayId={source.id}
          contacts={contacts}
          documentsClient={documentsClient}
          formatNights={(count) => t('stay.nights', { count })}
        />
      );
    case 'event':
      return (
        <EventWorkspace
          {...identity}
          eventId={source.id}
          contacts={contacts}
          documentsClient={documentsClient}
        />
      );
    case 'journey':
      return (
        <JourneyWorkspace
          {...identity}
          journeyId={source.id}
          documentsClient={documentsClient}
          onViewJourney={(id) => open({ kind: 'journey', id })}
        />
      );
    case 'decision':
      return (
        <DecisionWorkspace {...identity} decisionId={source.id} backHref={`/trips/${tripId}`} />
      );
  }
  return <OtherSourceContent {...props} />;
}

function OtherSourceContent({
  tripId,
  client,
  contacts,
  documentsClient,
  source,
  onSelect,
}: Omit<TimelineContextProps, 'selection'> & { source: OverviewSource }) {
  const identity = { tripId, client };
  switch (source.kind) {
    case 'rental':
      return <TimelineRental {...identity} id={source.id} />;
    case 'meeting':
      return <PeopleContext {...identity} contacts={contacts} meetingId={source.id} />;
    case 'capture':
    case 'idea':
      return (
        <CaptureContext
          {...identity}
          contacts={contacts}
          documentsClient={documentsClient}
          view={source.kind === 'capture' ? 'inbox' : 'explore'}
          selectedSource={source}
          onViewEvent={(id) => onSelect({ kind: 'source', source: { kind: 'event', id } })}
        />
      );
  }
  return null;
}
