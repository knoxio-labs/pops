import { useSyncExternalStore } from 'react';

import { Button, Select, Textarea, TextInput } from '@pops/ui';

import { ideaKinds, ideaPurposes, ideaStatuses } from './choices';
import { IdeaFindings } from './IdeaFindings';
import { IdeaLocationFields } from './IdeaLocationFields';
import { IdeaReferences } from './IdeaReferences';
import { IdeaTimingFields } from './IdeaTimingFields';

import type { JSX } from 'react';

import type { IdeaFieldProps } from './idea-field-types';

/** Edit the actual independent Idea; dates, location, purpose and route membership stay separate. */
export function IdeaFields({
  session,
  row,
  busy,
  context,
  expanded,
}: Omit<IdeaFieldProps, 'value'> & { expanded?: boolean }): JSX.Element {
  useSyncExternalStore(
    session.records.subscribe,
    session.records.getVersion,
    session.records.getVersion
  );
  const draft = session.records.idea(row.id);
  const props = { session, row, value: { ...row, ...draft?.input }, busy, context };
  return (
    <details open={expanded}>
      <summary className="min-h-11 cursor-pointer py-3 text-sm">Edit Idea {row.id}</summary>
      <div className="space-y-4">
        <IdeaFindings value={props.value} context={context} />
        <IdeaBasicFields {...props} />
        <IdeaTextFields {...props} />
        <IdeaLocationFields {...props} />
        <IdeaTimingFields {...props} />
        <IdeaReferences {...props} />
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
