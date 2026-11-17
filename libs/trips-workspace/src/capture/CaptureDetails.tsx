import { Select, TextInput } from '@pops/ui';

import { captureClassifications as classifications, ideaKinds } from './choices';

import type { JSX } from 'react';

import type { CaptureComposerProps } from './composer-types';
import type { CaptureDraft } from './types';

type DetailsProps = CaptureComposerProps;

/** Optional kind, URL and location selections never parse or replace the raw source. */
export function CaptureDetails(props: DetailsProps): JSX.Element {
  const { session, state } = props;
  return (
    <details className="@container space-y-3">
      <summary className="min-h-11 cursor-pointer py-3 text-sm text-muted-foreground">
        Optional details
      </summary>
      <div className="grid gap-3 @lg:grid-cols-2">
        <KindDetails {...props} />
        <TextInput
          label="Source URL"
          value={state.draft.originalUrl}
          disabled={state.composerLocked}
          onChange={(event) => session.editor.editDraft({ originalUrl: event.target.value })}
        />
        <LocationDetails {...props} />
      </div>
    </details>
  );
}
function KindDetails({ session, state, view }: DetailsProps): JSX.Element {
  const draft = state.draft;
  const idea = draft.target?.mode === 'createIdea' ? draft.target : undefined;
  const choices =
    view === 'explore' || idea !== undefined ? [...ideaKinds, ...classifications] : classifications;
  const selectKind = (value: string): void => {
    const selectedIdea = ideaKinds.find((kind) => kind === value);
    if (selectedIdea)
      session.editor.editDraft({
        classification: null,
        target: {
          mode: 'createIdea',
          input: {
            ...idea?.input,
            kind: selectedIdea,
            placeId: draft.placeId,
            visitId: draft.visitId,
          },
        },
      });
    else
      session.editor.editDraft({
        classification: classifications.find((kind) => kind === value) ?? null,
        target: undefined,
      });
  };
  return (
    <>
      <Select
        label="Type"
        value={idea?.input.kind ?? draft.classification ?? ''}
        disabled={state.composerLocked}
        options={[
          { value: '', label: 'Unclassified' },
          ...choices.map((value) => ({ value, label: value })),
        ]}
        onChange={(event) => selectKind(event.target.value)}
      />
      {idea ? (
        <TextInput
          label="Idea title"
          value={idea.input.name ?? ''}
          disabled={state.composerLocked}
          onChange={(event) =>
            session.editor.editDraft({
              target: {
                mode: 'createIdea',
                input: { ...idea.input, name: event.target.value || null },
              },
            })
          }
        />
      ) : null}
    </>
  );
}
function LocationDetails({ session, state, context }: DetailsProps): JSX.Element {
  const draft = state.draft;
  const setLocation = (field: 'placeId' | 'visitId', value: string): void => {
    const id = value === '' ? null : Number(value);
    const update: Partial<CaptureDraft> = { [field]: id };
    if (draft.target?.mode === 'createIdea')
      update.target = { mode: 'createIdea', input: { ...draft.target.input, [field]: id } };
    session.editor.editDraft(update);
  };
  const visits = (context.visits.data ?? []).map((visit) => ({
    id: visit.id,
    name: `Visit ${visit.id}`,
  }));
  return (
    <>
      <Select
        label="Recorded location"
        value={draft.placeId === null ? '' : String(draft.placeId)}
        disabled={state.composerLocked}
        options={locationOptions(context.places.data ?? [], draft.placeId, 'place')}
        onChange={(event) => setLocation('placeId', event.target.value)}
      />
      <Select
        label="In visit"
        value={draft.visitId === null ? '' : String(draft.visitId)}
        disabled={state.composerLocked}
        options={locationOptions(visits, draft.visitId, 'visit')}
        onChange={(event) => setLocation('visitId', event.target.value)}
      />
    </>
  );
}
function locationOptions(
  sources: { id: number; name: string }[],
  current: number | null,
  kind: 'place' | 'visit'
): { value: string; label: string }[] {
  return [
    { value: '', label: 'Unassigned' },
    ...sources.map((source) => ({
      value: String(source.id),
      label: `${source.name} · ${source.id}`,
    })),
    ...(current !== null && !sources.some((source) => source.id === current)
      ? [{ value: String(current), label: `Unavailable ${kind} ${current}` }]
      : []),
  ];
}
