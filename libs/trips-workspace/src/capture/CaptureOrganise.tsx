import { useSyncExternalStore } from 'react';

import { Button, Select, Textarea, TextInput } from '@pops/ui';

import type { JSX } from 'react';

import type { CaptureBrowserSession } from './browser-session';
import type { Capture, CaptureSource, CaptureTargetInput } from './types';

type Choice = { value: string; label: string; target: CaptureTargetInput };
type Props = {
  session: CaptureBrowserSession;
  capture: Capture;
  source: CaptureSource;
  busy: boolean;
};

/** Associate an existing typed source or explicitly describe a newly created target without changing raw material. */
export function CaptureOrganise(props: Props): JSX.Element {
  const { session, capture, source, busy } = props;
  useSyncExternalStore(
    session.records.subscribe,
    session.records.getVersion,
    session.records.getVersion
  );
  const selected = session.records.organisation(capture.id)?.target;
  const choices = targetChoices(source);
  const value =
    selected?.mode === 'existing'
      ? (choices.find((choice) => JSON.stringify(choice.target) === JSON.stringify(selected))
          ?.value ?? '')
      : (selected?.mode ?? '');
  return (
    <details>
      <summary className="min-h-11 cursor-pointer py-3 text-sm">Organise</summary>
      <div className="space-y-3">
        <Select
          label="Organise as"
          value={value}
          disabled={busy}
          options={[
            { value: '', label: 'Choose a target' },
            ...choices.map(({ value: id, label }) => ({ value: id, label })),
          ]}
          onChange={(event) =>
            session.records.chooseTarget(
              capture,
              choices.find((choice) => choice.value === event.target.value)?.target
            )
          }
        />
        <NewTargetFields {...props} selected={selected} />
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || selected === undefined}
            onClick={() => void session.records.organise(capture.id)}
          >
            Organise capture
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => session.records.discard('organisation', capture.id)}
          >
            Clear organisation choice
          </Button>
        </div>
        <ExistingAssociations {...props} />
      </div>
    </details>
  );
}
function NewTargetFields({
  session,
  capture,
  selected,
  busy,
}: Props & { selected: CaptureTargetInput }): JSX.Element | null {
  if (selected === undefined || selected.mode === 'existing') return null;
  const change = (field: 'name' | 'notes', value: string): void => {
    const patch = field === 'name' ? { name: value || null } : { notes: value };
    switch (selected.mode) {
      case 'createIdea':
        session.records.chooseTarget(capture, {
          mode: 'createIdea',
          input: { ...selected.input, ...patch },
        });
        break;
      case 'createEvent':
        session.records.chooseTarget(capture, {
          mode: 'createEvent',
          input: { ...selected.input, ...patch },
        });
        break;
      case 'createJourney':
        session.records.chooseTarget(capture, {
          mode: 'createJourney',
          input: { ...selected.input, ...patch },
        });
        break;
      case 'createStay':
        session.records.chooseTarget(capture, {
          mode: 'createStay',
          input: { ...selected.input, ...patch },
        });
        break;
    }
  };
  return (
    <div className="space-y-3">
      <TextInput
        label="Target name"
        value={selected.input.name ?? ''}
        disabled={busy}
        onChange={(event) => change('name', event.target.value)}
      />
      <Textarea
        aria-label="Target notes"
        value={selected.input.notes ?? ''}
        disabled={busy}
        onChange={(event) => change('notes', event.target.value)}
      />
    </div>
  );
}
function ExistingAssociations({ source, capture, session, busy }: Props): JSX.Element {
  return (
    <div className="space-y-2">
      {source.associations
        .filter((row) => row.captureId === capture.id && row.removedAt === null)
        .map((row) => (
          <div className="flex flex-wrap items-center gap-3" key={row.id}>
            <span>
              {row.target.kind === 'contact'
                ? `Unresolved contact: ${row.target.reference.label ?? row.target.reference.uri}`
                : `${row.target.kind} ${row.target.id}`}{' '}
              · {row.provenance}
            </span>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void session.editor.commit(
                  { kind: 'association.remove', id: row.id, expectedRevision: row.revision },
                  'Remove association'
                )
              }
            >
              Remove association
            </Button>
          </div>
        ))}
    </div>
  );
}
function targetChoices(source: CaptureSource): Choice[] {
  return [
    ...source.ideas
      .filter((row) => row.removedAt === null)
      .map((row): Choice => ({
        value: `idea:${row.id}`,
        label: `Idea ${row.id}${row.name ? `: ${row.name}` : ''}`,
        target: { mode: 'existing', target: { kind: 'idea', id: row.id } },
      })),
    ...source.events.map((row): Choice => ({
      value: `event:${row.id}`,
      label: `Event ${row.id}${row.name ? `: ${row.name}` : ''}`,
      target: { mode: 'existing', target: { kind: 'event', id: row.id } },
    })),
    ...source.journeys.map((row): Choice => ({
      value: `journey:${row.id}`,
      label: `Journey ${row.id}${row.name ? `: ${row.name}` : ''}`,
      target: { mode: 'existing', target: { kind: 'journey', id: row.id } },
    })),
    ...source.stays.map((row): Choice => ({
      value: `stay:${row.id}`,
      label: `Stay ${row.id}${row.name ? `: ${row.name}` : ''}`,
      target: { mode: 'existing', target: { kind: 'stay', id: row.id } },
    })),
    { value: 'createIdea', label: 'Create Idea', target: { mode: 'createIdea', input: {} } },
    { value: 'createEvent', label: 'Create Event', target: { mode: 'createEvent', input: {} } },
    {
      value: 'createJourney',
      label: 'Create Journey',
      target: { mode: 'createJourney', input: {} },
    },
    { value: 'createStay', label: 'Create Stay', target: { mode: 'createStay', input: {} } },
  ];
}
