import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import { IdeaCreateContext } from '@pops/trips-workspace';
import { Button, TextInput } from '@pops/ui';

import { timelineCreateSession } from './timeline-create-session';
import { TimelineCreateActions } from './TimelineCreateActions';
import { TimelineCreatePlace } from './TimelineCreatePlace';

import type { TimelineContextProps } from './timeline-context-types';
import type { TimelineCreateSession } from './timeline-create-session';
import type { TimelineCreatedSource, TimelineCreateKind } from './timeline-create-session';

type CreateProps = Omit<TimelineContextProps, 'selection'> & {
  sourceKind: TimelineCreateKind | 'idea' | null;
};

/** Create explicit source facts in the owning Timeline, then open the existing persisted editor. */
export function TimelineCreate(props: CreateProps) {
  const { onSelect } = props;
  const onCreated = useCallback(
    (source: { kind: 'idea'; id: number }) => onSelect({ kind: 'source', source }),
    [onSelect]
  );
  if (props.sourceKind === null) return <CreateChoices {...props} />;
  if (props.sourceKind === 'idea')
    return <IdeaCreateContext tripId={props.tripId} client={props.client} onCreated={onCreated} />;
  return <CreateSource key={props.sourceKind} {...props} sourceKind={props.sourceKind} />;
}

function CreateChoices({ onSelect }: CreateProps) {
  const { t } = useTranslation('trips');
  return (
    <div className="grid gap-2">
      {(['visit', 'journey', 'stay', 'event', 'rental', 'idea'] as const).map((sourceKind) => (
        <Button
          key={sourceKind}
          variant="outline"
          className="min-h-11 justify-start"
          onClick={() => onSelect({ kind: 'create', sourceKind })}
        >
          {t(`overview.kinds.${sourceKind}`)}
        </Button>
      ))}
      {(['people', 'capture'] as const).map((tool) => (
        <Button
          key={tool}
          variant="outline"
          className="min-h-11 justify-start"
          onClick={() => onSelect({ kind: 'tool', tool })}
        >
          {t(`timeline.tools.${tool}`)}
        </Button>
      ))}
    </div>
  );
}

function CreateSource(props: CreateProps & { sourceKind: TimelineCreateKind }) {
  const { sourceKind, onSelect } = props;
  const { t } = useTranslation('trips');
  const { session, state, openCreated, locked } = useCreateSource(props);
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void session.submit().then((created) => {
          if (created) openCreated(created);
        });
      }}
    >
      <h2 className="text-lg font-semibold">{t(`overview.kinds.${sourceKind}`)}</h2>
      {sourceKind === 'visit' ? (
        <TimelineCreatePlace {...props} session={session} state={state} locked={locked} />
      ) : (
        <TextInput
          label={t(sourceKind === 'rental' ? 'timeline.create.provider' : nameLabel(sourceKind))}
          value={state.text}
          disabled={locked}
          onChange={(event) => session.edit({ text: event.target.value })}
        />
      )}
      <p className="text-sm text-muted-foreground">{t('timeline.create.details')}</p>
      {state.status === 'rejected' && <p role="alert">{t('timeline.create.failed')}</p>}
      {state.status === 'unknown' && <p role="alert">{t('timeline.create.uncertain')}</p>}
      {state.status === 'confirmed' && <p role="status">{t('timeline.create.confirmed')}</p>}
      <TimelineCreateActions
        session={session}
        state={state}
        locked={locked}
        onSelect={onSelect}
        openCreated={openCreated}
      />
    </form>
  );
}

function useCreateSource({
  tripId,
  client,
  sourceKind,
  onSelect,
}: CreateProps & { sourceKind: TimelineCreateKind }) {
  const cache = useQueryClient();
  const session = useMemo(
    () => timelineCreateSession(cache, { tripId, client }, sourceKind),
    [cache, tripId, client, sourceKind]
  );
  const state = useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot);
  const view = useMemo(() => new CreateView(session, onSelect), [session, onSelect]);
  useLayoutEffect(() => {
    view.activate();
    return () => view.deactivate();
  }, [view]);
  const openCreated = (created: TimelineCreatedSource) => {
    if (!view.isCurrent()) return;
    if (created.kind === 'place') {
      timelineCreateSession(cache, { tripId, client }, 'visit').edit({ placeId: created.id });
      view.select({ kind: 'create', sourceKind: 'visit' });
    } else view.select({ kind: 'source', source: created });
  };
  const locked =
    state.status === 'pending' || state.status === 'unknown' || state.status === 'confirmed';
  return { session, state, openCreated, locked };
}

function nameLabel(kind: TimelineCreateKind) {
  return kind === 'place' ? 'timeline.create.placeName' : 'name';
}

class CreateView {
  private active = false;

  constructor(
    private readonly session: TimelineCreateSession,
    private readonly onSelect: TimelineContextProps['onSelect']
  ) {}

  activate() {
    this.active = true;
  }
  deactivate() {
    this.active = false;
  }
  isCurrent() {
    return this.active && this.session.isCurrent();
  }
  select(selection: Parameters<TimelineContextProps['onSelect']>[0]) {
    if (this.isCurrent()) this.onSelect(selection);
  }
}
