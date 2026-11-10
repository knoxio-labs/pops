import { useSyncExternalStore } from 'react';

import { Button, Select, Textarea, TextInput } from '@pops/ui';

import { ideaKinds, ideaPurposes, ideaStatuses } from './choices';
import { IdeaTimingFields } from './IdeaTimingFields';

import type { JSX } from 'react';

import type { CaptureBrowserSession } from './browser-session';
import type { CaptureSource } from './types';
import type { CaptureContext } from './use-capture-context';

type Idea = CaptureSource['ideas'][number];
/** Explicit Idea facts and retained source revision used by inline detail controls. */
export interface IdeaFieldProps {
  session: CaptureBrowserSession;
  row: Idea;
  value: Idea;
  busy: boolean;
  context: CaptureContext;
}

/** Edit the actual independent Idea; dates, location, purpose and route membership stay separate. */
export function IdeaFields({
  session,
  row,
  busy,
  context,
}: Omit<IdeaFieldProps, 'value'>): JSX.Element {
  useSyncExternalStore(
    session.records.subscribe,
    session.records.getVersion,
    session.records.getVersion
  );
  const draft = session.records.idea(row.id);
  const props = { session, row, value: { ...row, ...draft?.input }, busy, context };
  return (
    <details>
      <summary className="min-h-11 cursor-pointer py-3 text-sm">Edit Idea {row.id}</summary>
      <div className="space-y-4">
        <IdeaBasicFields {...props} />
        <IdeaTextFields {...props} />
        <IdeaLocationFields {...props} />
        <IdeaTimingFields {...props} />
        {draft ? (
          <Button variant="ghost" onClick={() => session.records.discard('idea', row.id)}>
            Discard unsaved Idea edits
          </Button>
        ) : null}
      </div>
    </details>
  );
}
function IdeaBasicFields({ session, row, value, busy }: IdeaFieldProps): JSX.Element {
  const save = (): void => {
    void session.records.saveIdea(row.id);
  };
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <IdeaName session={session} row={row} value={value} busy={busy} />
      <Select
        label="Idea kind"
        value={value.kind ?? ''}
        disabled={busy}
        options={[
          { value: '', label: 'Unspecified' },
          ...ideaKinds.map((kind) => ({ value: kind, label: kind })),
        ]}
        onChange={(event) => {
          session.records.editIdea(row, {
            kind: ideaKinds.find((kind) => kind === event.target.value) ?? null,
          });
          save();
        }}
      />
      <Select
        label="Idea purpose"
        value={value.purpose ?? ''}
        disabled={busy}
        options={[
          { value: '', label: 'Unspecified' },
          ...ideaPurposes.map((purpose) => ({ value: purpose, label: purpose })),
        ]}
        onChange={(event) => {
          session.records.editIdea(row, {
            purpose: ideaPurposes.find((purpose) => purpose === event.target.value) ?? null,
          });
          save();
        }}
      />
      <Select
        label="Idea status"
        value={value.status ?? ''}
        disabled={busy}
        options={[
          { value: '', label: 'Unspecified' },
          ...ideaStatuses.map((status) => ({ value: status, label: status })),
        ]}
        onChange={(event) => {
          session.records.editIdea(row, {
            status: ideaStatuses.find((status) => status === event.target.value) ?? null,
          });
          save();
        }}
      />
    </div>
  );
}
function IdeaTextFields({ session, row, value, busy }: IdeaFieldProps): JSX.Element {
  return (
    <div className="space-y-3">
      <label className="block space-y-2">
        <span className="text-sm">Reason for keeping</span>
        <Textarea
          aria-label="Reason for keeping"
          value={value.reason}
          disabled={busy}
          onChange={(event) => session.records.editIdea(row, { reason: event.target.value })}
          onBlur={() => void session.records.saveIdea(row.id)}
        />
      </label>
      <label className="block space-y-2">
        <span className="text-sm">Idea notes</span>
        <Textarea
          aria-label="Idea notes"
          value={value.notes}
          disabled={busy}
          onChange={(event) => session.records.editIdea(row, { notes: event.target.value })}
          onBlur={() => void session.records.saveIdea(row.id)}
        />
      </label>
      <TextInput
        label="Idea address"
        value={value.address ?? ''}
        disabled={busy}
        onChange={(event) => session.records.editIdea(row, { address: event.target.value || null })}
        onBlur={() => void session.records.saveIdea(row.id)}
      />
    </div>
  );
}
function IdeaLocationFields({ session, row, value, busy, context }: IdeaFieldProps): JSX.Element {
  const places = (context.places.data ?? []).map((place) => ({
    value: String(place.id),
    label: `${place.name} · ${place.id}`,
  }));
  const visits = (context.visits.data ?? []).map((visit) => ({
    value: String(visit.id),
    label: `Visit ${visit.id}`,
  }));
  if (value.placeId !== null && !places.some((place) => place.value === String(value.placeId)))
    places.push({ value: String(value.placeId), label: `Unavailable place ${value.placeId}` });
  if (value.visitId !== null && !visits.some((visit) => visit.value === String(value.visitId)))
    visits.push({ value: String(value.visitId), label: `Unavailable visit ${value.visitId}` });
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Select
        label="Idea recorded location"
        value={value.placeId === null ? '' : String(value.placeId)}
        disabled={busy}
        options={[{ value: '', label: 'Unassigned' }, ...places]}
        onChange={(event) => {
          session.records.editIdea(row, {
            placeId: event.target.value === '' ? null : Number(event.target.value),
          });
          void session.records.saveIdea(row.id);
        }}
      />
      <Select
        label="Idea in visit"
        value={value.visitId === null ? '' : String(value.visitId)}
        disabled={busy}
        options={[{ value: '', label: 'No visit' }, ...visits]}
        onChange={(event) => {
          session.records.editIdea(row, {
            visitId: event.target.value === '' ? null : Number(event.target.value),
          });
          void session.records.saveIdea(row.id);
        }}
      />
    </div>
  );
}

function IdeaName({ session, row, value, busy }: Omit<IdeaFieldProps, 'context'>): JSX.Element {
  return (
    <TextInput
      label="Idea name"
      value={value.name ?? ''}
      disabled={busy}
      onChange={(event) => session.records.editIdea(row, { name: event.target.value || null })}
      onBlur={() => void session.records.saveIdea(row.id)}
    />
  );
}
