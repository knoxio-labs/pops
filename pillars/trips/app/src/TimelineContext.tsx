import { useTranslation } from 'react-i18next';

import { Sheet } from '@pops/ui';

import { CaptureContext } from './CaptureContext';
import { PeopleContext } from './PeopleContext';
import { TripSettingsContext } from './settings/TripSettingsPage';
import { TimelineCreate } from './TimelineCreate';
import { TimelineRouteEditor } from './TimelineRouteEditor';
import { TimelineSourceContext } from './TimelineSourceContext';

import type { TFunction } from 'i18next';

import type { TimelineContextProps, TimelineSelection } from './timeline-context-types';

export type { TimelineContextProps, TimelineSelection } from './timeline-context-types';

/** Mount canonical source editors and tools over the same Timeline without another destination. */
export function TimelineContext(props: TimelineContextProps) {
  const { t } = useTranslation('trips');
  const { selection, onSelect } = props;
  if (selection === null) return null;
  const title = contextTitle(selection, t);
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onSelect(null);
      }}
      title={title}
    >
      <ContextContent {...props} selection={selection} />
    </Sheet>
  );
}

type ContentProps = TimelineContextProps & { selection: TimelineSelection };

function ContextContent(props: ContentProps) {
  const { tripId, client, contacts, documentsClient, selection, onSelect } = props;
  if (selection.kind === 'create')
    return <TimelineCreate {...props} sourceKind={selection.sourceKind} />;
  if (selection.kind === 'metadata')
    return (
      <TripSettingsContext
        tripId={tripId}
        clients={{ tripClient: client, tagsClient: props.tagsClient }}
        contextual
      />
    );
  if (selection.kind === 'placement')
    return <TimelineRouteEditor identity={{ tripId, client }} target={selection.target} />;
  if (selection.kind === 'source')
    return <TimelineSourceContext {...props} source={selection.source} />;
  if (selection.tool === 'people')
    return <PeopleContext tripId={tripId} client={client} contacts={contacts} />;
  return (
    <CaptureContext
      tripId={tripId}
      client={client}
      contacts={contacts}
      documentsClient={documentsClient}
      view={selection.tool}
      onViewEvent={(id) => onSelect({ kind: 'source', source: { kind: 'event', id } })}
    />
  );
}

function contextTitle(selection: TimelineSelection, t: TFunction<'trips'>): string {
  if (selection.kind === 'create') return t('timeline.create.title');
  if (selection.kind === 'metadata') return t('settings');
  if (selection.kind === 'source')
    return t('overview.source', {
      kind: t(`overview.kinds.${selection.source.kind}`),
      id: selection.source.id,
    });
  if (selection.kind === 'tool') return t(`timeline.tools.${selection.tool}`);
  if (selection.target)
    return t('overview.source', {
      kind: t(`overview.kinds.${selection.target.kind}`),
      id: selection.target.id,
    });
  return t('timeline.route.title');
}
