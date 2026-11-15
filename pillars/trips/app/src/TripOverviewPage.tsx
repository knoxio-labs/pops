import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import {
  AccommodationGapProvider,
  ArrangementResponsibilityProvider,
  TripOverview,
} from '@pops/trips-workspace';
import { ErrorState } from '@pops/ui';

import { useArrangementContacts } from './arrangements/use-arrangement-contacts';
import { CaptureContext } from './CaptureContext';
import { sourceId } from './source-id';
import { useOverviewLabels } from './timeline-labels';
import { accommodationContext } from './TimelineAccommodation';
import { TimelineContext } from './TimelineContext';
import { TimelineControls, TimelineFilters } from './TimelineControls';
import { client as defaultClient } from './trips-api/client.gen';
import { useTimelineSelection } from './use-timeline-selection';

import type { RemotePageHostProps } from '@pops/pillar-sdk';
import type {
  CaptureTimelineSelection,
  CaptureTimelineVisibility,
  OverviewCalendarSelection,
  OverviewKind,
} from '@pops/trips-workspace';

import type { ApiClients } from './api/types';
import type { CaptureContextProps } from './CaptureContext';
import type { TimelineContextProps } from './TimelineContext';

type TimelineOwnerProps = RemotePageHostProps &
  Pick<CaptureContextProps, 'client' | 'documentsClient'> & {
    initialCalendar?: boolean;
    tagsClient?: ApiClients['tagsClient'];
  };

/** Preserve the Calendar entry URL as the selected Trip Timeline with its date filter enabled. */
export function TripCalendarPage(props: RemotePageHostProps = {}) {
  return <TripOverviewPage {...props} initialCalendar />;
}

/** Bind the selected Trip Timeline to its owning identities and shell capabilities. */
export function TripOverviewPage(props: TimelineOwnerProps = {}) {
  const params = useParams();
  const tripId = sourceId(params.tripId);
  const chooser = useArrangementContacts(
    props.contacts,
    tripId,
    (props.client ?? defaultClient).getConfig().baseUrl
  );
  const { t } = useTranslation('trips');
  if (tripId === undefined)
    return (
      <ErrorState
        error={{ code: 'trips.identity.invalid', message: t('overview.invalid'), retryable: false }}
      />
    );
  return (
    <AccommodationGapProvider identity={{ tripId, client: props.client }}>
      <ArrangementResponsibilityProvider identity={{ tripId, client: props.client }}>
        <TimelineSession
          key={`${(props.client ?? defaultClient).getConfig().baseUrl}:${tripId}`}
          {...props}
          tripId={tripId}
          {...chooser}
        />
      </ArrangementResponsibilityProvider>
    </AccommodationGapProvider>
  );
}

function TimelineSession(
  props: TimelineOwnerProps &
    Pick<
      Parameters<typeof TimelineContext>[0],
      'contactChooserIntent' | 'advanceContactChooserIntent'
    > & { tripId: number }
) {
  const { tripId } = props;
  const { i18n } = useTranslation('trips');
  const presentation = useTimelinePresentationState(props.initialCalendar);
  const { selection, onSelect, changed } = useTimelineSelection(props.client);
  const labels = useOverviewLabels();
  if (changed)
    return (
      <ErrorState
        error={{
          code: 'trips.context.changed',
          message: labels.status('connectionChanged'),
          retryable: false,
        }}
      />
    );
  return (
    <TripOverview
      tripId={tripId}
      client={props.client}
      locale={i18n.resolvedLanguage ?? i18n.language}
      labels={labels}
      backHref="/trips"
      documentsHref={`/trips/${tripId}/documents`}
      settingsHref={`/trips/${tripId}/settings`}
      href={(kind, id) => sourceHref(tripId, kind, id)}
      onOpenSource={(source) => onSelect({ kind: 'source', source })}
      onOpenTool={(tool) => onSelect({ kind: 'tool', tool })}
      onOpenPlacement={(target) => onSelect({ kind: 'placement', target })}
      controls={<TimelineControls {...presentation} onSelect={onSelect} />}
      sourceVisibility={presentation.sourceVisibility}
      sourceControls={
        <TimelineFilters
          {...props}
          selection={presentation.sourceFilter}
          onChange={presentation.setSourceFilter}
          onVisibility={presentation.setSourceVisibility}
          onSelect={onSelect}
        />
      }

      calendar={
        presentation.calendarEnabled
          ? {
              selection: presentation.calendarSelection,
              onChange: presentation.setCalendarSelection,
            }
          : undefined
      }
      renderVisitContext={accommodationContext({ tripId, client: props.client, onSelect })}
      {...timelineContexts({ ...props, selection, onSelect })}
    />
  );
}

function timelineContexts(props: TimelineContextProps) {
  const { selection, onSelect } = props;
  const captureComposer =
    selection?.kind === 'tool' && selection.tool !== 'people' ? undefined : (
      <CaptureContext
        tripId={props.tripId}
        client={props.client}
        documentsClient={props.documentsClient}
        contacts={props.contacts}
        view="capture"
        compact
        onViewEvent={(id) => onSelect({ kind: 'source', source: { kind: 'event', id } })}
      />
    );
  const contextualEditor = selection ? <TimelineContext {...props} workspace /> : undefined;
  return { captureComposer, contextualEditor };
}

function sourceHref(tripId: number, kind: OverviewKind, id: number) {
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
}

function useTimelinePresentationState(initialCalendar?: boolean) {
  const [sourceFilter, setSourceFilter] = useState<CaptureTimelineSelection>({
    kind: 'all',
    organisation: 'all',
    location: 'all',
  });
  const [sourceVisibility, setSourceVisibility] = useState<CaptureTimelineVisibility>();
  const [calendarEnabled, setCalendarEnabled] = useState(initialCalendar ?? false);
  const [calendarSelection, setCalendarSelection] = useState<OverviewCalendarSelection>({
    from: '',
    to: '',
    zone: '',
    kind: 'all',
    journey: '',
  });
  return {
    sourceFilter,
    setSourceFilter,
    sourceVisibility,
    setSourceVisibility,
    calendarEnabled,
    toggleCalendar: () => setCalendarEnabled((enabled) => !enabled),
    calendarSelection,
    setCalendarSelection,
  };
}
