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
import { useTimelinePresentationState } from './use-timeline-presentation-state';
import { useTimelineSelection } from './use-timeline-selection';

import type { RemotePageHostProps } from '@pops/pillar-sdk';
import type { OverviewLinkKind } from '@pops/trips-workspace';

import type { ApiClients } from './api/types';
import type { CaptureContextProps } from './CaptureContext';

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

type TimelineSessionProps = TimelineOwnerProps &
  Pick<
    Parameters<typeof TimelineContext>[0],
    'contactChooserIntent' | 'advanceContactChooserIntent'
  > & { tripId: number };

function TimelineSession(props: TimelineSessionProps) {
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
    <TimelineOverview
      props={props}
      presentation={presentation}
      selection={selection}
      onSelect={onSelect}
    />
  );
}

function TimelineOverview({
  props,
  presentation,
  selection,
  onSelect,
}: {
  props: TimelineSessionProps;
  presentation: ReturnType<typeof useTimelinePresentationState>;
  selection: ReturnType<typeof useTimelineSelection>['selection'];
  onSelect: ReturnType<typeof useTimelineSelection>['onSelect'];
}) {
  const { i18n } = useTranslation('trips');
  const { tripId } = props;
  const labels = useOverviewLabels();
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
      sourceControls={sourceFilters(props, presentation, onSelect)}
      captureComposer={captureComposer(props, selection, tripId)}
      calendar={
        presentation.calendarEnabled
          ? {
              selection: presentation.calendarSelection,
              onChange: presentation.setCalendarSelection,
            }
          : undefined
      }
      renderVisitContext={accommodationContext({ tripId, client: props.client, onSelect })}
      contextualEditor={<TimelineContext {...props} selection={selection} onSelect={onSelect} />}
    />
  );
}

function sourceHref(tripId: number, kind: OverviewLinkKind, id: number): string {
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
  }
}

function sourceFilters(
  props: TimelineSessionProps,
  presentation: ReturnType<typeof useTimelinePresentationState>,
  onSelect: ReturnType<typeof useTimelineSelection>['onSelect']
) {
  return (
    <TimelineFilters
      {...props}
      selection={presentation.sourceFilter}
      onChange={presentation.setSourceFilter}
      onVisibility={presentation.setSourceVisibility}
      onSelect={onSelect}
    />
  );
}

function captureComposer(
  props: TimelineSessionProps,
  selection: ReturnType<typeof useTimelineSelection>['selection'],
  tripId: number
) {
  if (selection?.kind === 'tool' && selection.tool === 'capture') return undefined;
  return (
    <CaptureContext
      tripId={tripId}
      client={props.client}
      contacts={props.contacts}
      documentsClient={props.documentsClient}
      view="capture"
    />
  );
}
