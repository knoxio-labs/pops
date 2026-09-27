import {
  Button,
  ComboboxSelect,
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

import { ListError } from '../../foundation/list-page/list-states.js';
import { useFixtureForm } from './fixture-form-state.js';
import { FIXTURE_KIND_ORDER, FIXTURE_KINDS, isFixtureKind } from './fixture-kinds.js';
import { fixtureLocationOptions } from './fixture-model.js';

import type { ReactElement } from 'react';

import type { LocationModel } from '../../foundation/model/model.js';
import type { FixtureDraft, FixtureFormDialogProps } from './fixture-form-dialog.js';

function RoomField({
  draft,
  locations,
  locationsStatus,
  onRetryLocations,
  onChange,
}: {
  readonly draft: FixtureDraft;
  readonly locations: readonly LocationModel[];
  readonly locationsStatus: 'pending' | 'error' | 'success';
  readonly onRetryLocations: () => void;
  readonly onChange: (patch: Partial<FixtureDraft>) => void;
}): ReactElement {
  if (locationsStatus === 'error') return <ListError noun="rooms" onRetry={onRetryLocations} />;
  const options = fixtureLocationOptions(locations);
  return (
    <div className="grid gap-1.5">
      <FieldLabel htmlFor="fixture-room" label="Room" />
      <ComboboxSelect
        id="fixture-room"
        aria-label="Room"
        options={[...options]}
        value={draft.locationId}
        placeholder="Choose where it is built in"
        searchPlaceholder="Find a place"
        emptyMessage="No rooms found."
        disabled={locationsStatus === 'pending'}
        onChange={(value) =>
          onChange({
            locationId: typeof value === 'string' && value.length > 0 ? value : '',
          })
        }
      />
    </div>
  );
}

function FixtureFields({
  draft,
  locations,
  locationsStatus,
  onRetryLocations,
  onChange,
}: {
  readonly draft: FixtureDraft;
  readonly locations: readonly LocationModel[];
  readonly locationsStatus: 'pending' | 'error' | 'success';
  readonly onRetryLocations: () => void;
  readonly onChange: (patch: Partial<FixtureDraft>) => void;
}): ReactElement {
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
        value={draft.kind ?? ''}
        placeholder="Choose a kind"
        options={FIXTURE_KIND_ORDER.map((value) => ({
          value,
          label: FIXTURE_KINDS[value].label,
        }))}
        onChange={(event) => {
          if (isFixtureKind(event.target.value)) onChange({ kind: event.target.value });
        }}
      />
      <RoomField
        draft={draft}
        locations={locations}
        locationsStatus={locationsStatus}
        onRetryLocations={onRetryLocations}
        onChange={onChange}
      />
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

/** Renders the fixture dialog body and retains its draft when saving fails. */
export function FixtureFormContent(props: FixtureFormDialogProps): ReactElement {
  const { draft, missing, saving, submit, updateDraft } = useFixtureForm(props);
  const disabled = props.disabledReason !== undefined;
  const locationsStatus = props.locationsStatus ?? 'success';

  return (
    <DialogContent className="md:max-w-md">
      <DialogHeader>
        <DialogTitle>{props.fixture ? `Edit ${props.fixture.name}` : 'New fixture'}</DialogTitle>
        <DialogDescription>Part of the house that items plug into or hang from.</DialogDescription>
      </DialogHeader>
      <FixtureFields
        draft={draft}
        locations={props.locations}
        locationsStatus={locationsStatus}
        onRetryLocations={props.onRetryLocations ?? (() => undefined)}
        onChange={updateDraft}
      />
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
