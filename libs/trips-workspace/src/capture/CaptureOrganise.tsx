import { useSyncExternalStore } from 'react';

import { Button, Select, Textarea, TextInput } from '@pops/ui';

import { CaptureContactReference } from './CaptureContactReference';
import { organisationChoices, selectedValue } from './organisation-choices';

import type { JSX } from 'react';

import type { CaptureBrowserSession } from './browser-session';
import type { Capture, CaptureSource, CaptureTargetInput } from './types';

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
  const choices = organisationChoices(source, selected);
  const value = selectedValue(selected, choices);
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
        <ContactChoice {...props} selected={selected} />
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
            {row.target.kind === 'contact' ? (
              <CaptureContactReference session={session} reference={row.target.reference} />
            ) : (
              <span>
                {row.target.kind} {row.target.id}
              </span>
            )}
            <span>· {row.provenance}</span>
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
function ContactChoice({
  session,
  capture,
  busy,
  selected,
}: Props & { selected: CaptureTargetInput }): JSX.Element {
  return (
    <>
      <Button
        variant="outline"
        disabled={busy || !session.contacts.available}
        onClick={() => session.contacts.open({ kind: 'capture', id: capture.id }, true)}
      >
        Choose contact
      </Button>
      {selected?.mode === 'existing' && selected.target.kind === 'contact' ? (
        <p className="break-words text-sm">{selected.target.reference.uri}</p>
      ) : null}
    </>
  );
}
