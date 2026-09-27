import { useState } from 'react';

import {
  Button,
  ComboboxSelect,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldLabel,
  Select,
  TextInput,
  Textarea,
} from '@pops/ui';

import { FIXTURE_KIND_ORDER, FIXTURE_KINDS, isFixtureKind } from './fixture-kinds.js';
import { fixtureLocationOptions } from './fixture-model.js';

import type { ReactElement } from 'react';

import type { LocationModel } from '../../foundation/model/model.js';
import type { FixtureDetail, FixtureListRow } from './fixture-model.js';
import type { FixtureDraft } from './fixtures-page-model.js';

type FixtureRecord = FixtureDetail | FixtureListRow;

/** Props for the new and edit fixture dialog. */
export interface FixtureFormDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly locations: readonly LocationModel[];
  readonly fixture?: FixtureRecord;
  readonly disabledReason?: string;
  readonly onSave: (draft: FixtureDraft) => Promise<void>;
}

function initialDraft(fixture: FixtureRecord | undefined): FixtureDraft {
  return {
    name: fixture?.name ?? '',
    type: fixture?.type ?? 'power',
    locationId: fixture?.locationId ?? '',
    notes: fixture?.notes ?? null,
  };
}

function missingField(draft: FixtureDraft): string | null {
  if (draft.name.trim() === '') return 'Name it first.';
  if (draft.type.trim() === '') return 'Choose its kind.';
  if (draft.locationId === null || draft.locationId === '') return 'Choose its room.';
  return null;
}

function kindOptions(type: string): readonly { value: string; label: string }[] {
  const options: { value: string; label: string }[] = FIXTURE_KIND_ORDER.map((value) => ({
    value,
    label: FIXTURE_KINDS[value].label,
  }));
  if (!isFixtureKind(type)) options.unshift({ value: type, label: type || 'Other' });
  return options;
}

function FixtureFields({
  draft,
  locations,
  onChange,
}: {
  readonly draft: FixtureDraft;
  readonly locations: readonly LocationModel[];
  readonly onChange: (patch: Partial<FixtureDraft>) => void;
}): ReactElement {
  const options = fixtureLocationOptions(locations);
  return (
    <div className="grid gap-3">
      <TextInput
        label="Name"
        value={draft.name}
        placeholder="Desk double outlet"
        onChange={(event) => onChange({ name: event.target.value })}
      />
      <Select
        label="Kind"
        value={draft.type}
        options={[...kindOptions(draft.type)]}
        onChange={(event) => onChange({ type: event.target.value })}
      />
      <div className="grid gap-1.5">
        <FieldLabel htmlFor="fixture-room" label="Room" />
        <ComboboxSelect
          id="fixture-room"
          aria-label="Room"
          options={[...options]}
          value={draft.locationId ?? ''}
          placeholder="Choose where it is built in"
          searchPlaceholder="Find a place"
          emptyMessage="No rooms found."
          onChange={(value) =>
            onChange({ locationId: typeof value === 'string' && value.length > 0 ? value : '' })
          }
        />
      </div>
      <div className="grid gap-1.5">
        <FieldLabel htmlFor="fixture-notes" label="Note" />
        <Textarea
          id="fixture-notes"
          aria-label="Note"
          placeholder="Optional note, such as its circuit or patch port"
          value={draft.notes ?? ''}
          rows={2}
          onChange={(event) => onChange({ notes: event.target.value })}
        />
      </div>
    </div>
  );
}

function useFixtureForm(props: FixtureFormDialogProps): {
  readonly draft: FixtureDraft;
  readonly missing: string | null;
  readonly saving: boolean;
  readonly error: string | null;
  readonly updateDraft: (patch: Partial<FixtureDraft>) => void;
  readonly submit: () => Promise<void>;
} {
  const [draft, setDraft] = useState<FixtureDraft>(() => initialDraft(props.fixture));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = missingField(draft);
  const disabled = props.disabledReason !== undefined;
  const updateDraft = (patch: Partial<FixtureDraft>): void => {
    setDraft((current) => ({ ...current, ...patch }));
  };
  const submit = async (): Promise<void> => {
    if (missing !== null || disabled || saving) return;
    setSaving(true);
    setError(null);
    try {
      await props.onSave({
        ...draft,
        name: draft.name.trim(),
        locationId: draft.locationId === '' ? null : draft.locationId,
        notes: draft.notes === null || draft.notes.trim() === '' ? null : draft.notes.trim(),
      });
      props.onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The fixture was not saved.');
    } finally {
      setSaving(false);
    }
  };
  return { draft, missing, saving, error, updateDraft, submit };
}

function FixtureFormContent(props: FixtureFormDialogProps): ReactElement {
  const { draft, error, missing, saving, submit, updateDraft } = useFixtureForm(props);
  const disabled = props.disabledReason !== undefined;

  return (
    <DialogContent className="md:max-w-md">
      <DialogHeader>
        <DialogTitle>{props.fixture ? `Edit ${props.fixture.name}` : 'New fixture'}</DialogTitle>
        <DialogDescription>Part of the house that items plug into or hang from.</DialogDescription>
      </DialogHeader>
      <FixtureFields draft={draft} locations={props.locations} onChange={updateDraft} />
      {error !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter className="items-center gap-3 sm:justify-between">
        <p className="text-sm text-muted-foreground">{props.disabledReason ?? missing}</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={missing !== null || disabled || saving}
            loading={saving}
            onClick={() => void submit()}
          >
            {props.fixture ? 'Save' : 'Add fixture'}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
}

/** Renders the validated fixture create/edit form and reports save failures inline. */
export function FixtureFormDialog(props: FixtureFormDialogProps): ReactElement {
  const formKey = `${props.fixture?.id ?? 'new'}:${props.open ? 'open' : 'closed'}`;
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open ? <FixtureFormContent key={formKey} {...props} /> : null}
    </Dialog>
  );
}
