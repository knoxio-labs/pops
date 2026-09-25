import { locationPath } from '@/kit/inventory/foundation';
/**
 * New fixture, and Edit on a fixture's page: a name, what kind of fixture it
 * is, the room it is built into, and an optional note. A fixture has no
 * placement verbs; changing its room is an edit because walls do not move.
 */
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

import { FIXTURE_KIND_ORDER, FIXTURE_KINDS } from './fixture-kinds';

import type { PlacementWorld } from '@/kit/inventory/foundation';

import type { FixtureKind, FixtureModel } from './fixture-model';

/** Props for {@link FixtureFormDialog}. */
export interface FixtureFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  world: PlacementWorld;
  /** The fixture being edited; absent for a new one. */
  fixture?: FixtureModel;
  onSave?: (draft: Omit<FixtureModel, 'id' | 'addedAt'>) => void;
}

function placeOptions(world: PlacementWorld) {
  return [...world.locations.values()]
    .map((location) => ({
      value: location.id,
      label: locationPath(world, location.id)
        .map((node) => node.name)
        .join(' / '),
    }))
    .toSorted((a, b) => a.label.localeCompare(b.label));
}

const isKind = (value: string): value is FixtureKind =>
  FIXTURE_KIND_ORDER.some((kind) => kind === value);

function missingField(name: string, locationId: string): string | null {
  if (name.trim() === '') return 'Name it first.';
  return locationId === '' ? 'Choose its room.' : null;
}

type Draft = Omit<FixtureModel, 'id' | 'addedAt'>;

function FixtureFields(props: {
  draft: Draft;
  world: PlacementWorld;
  onChange: (patch: Partial<Draft>) => void;
}) {
  const { draft } = props;
  return (
    <div className="grid gap-3">
      <TextInput
        label="Name"
        value={draft.name}
        placeholder="Desk double outlet"
        onChange={(event) => props.onChange({ name: event.target.value })}
      />
      <Select
        label="Kind"
        value={draft.kind}
        options={FIXTURE_KIND_ORDER.map((value) => ({ value, label: FIXTURE_KINDS[value].label }))}
        onChange={(event) => {
          if (isKind(event.target.value)) props.onChange({ kind: event.target.value });
        }}
      />
      <div className="grid gap-1.5">
        <FieldLabel htmlFor="fixture-room" label="Room" />
        <ComboboxSelect
          id="fixture-room"
          aria-label="Room"
          options={placeOptions(props.world)}
          value={draft.locationId}
          placeholder="Choose where it is built in"
          searchPlaceholder="Find a place"
          onChange={(value) =>
            props.onChange({ locationId: typeof value === 'string' ? value : '' })
          }
        />
      </div>
      <Textarea
        aria-label="Note"
        placeholder="Optional note, such as its circuit or patch port"
        value={draft.note ?? ''}
        rows={2}
        onChange={(event) => props.onChange({ note: event.target.value })}
      />
    </div>
  );
}

function initialDraft(fixture: FixtureModel | undefined): Draft {
  if (fixture === undefined) return { name: '', kind: 'power', locationId: '', note: null };
  return {
    name: fixture.name,
    kind: fixture.kind,
    locationId: fixture.locationId,
    note: fixture.note,
  };
}

/** The fixture form. */
export function FixtureFormDialog(props: FixtureFormDialogProps) {
  const [draft, setDraft] = useState<Draft>(() => initialDraft(props.fixture));
  const missing = missingField(draft.name, draft.locationId);
  const note = draft.note?.trim() ?? '';
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="md:max-w-md">
        <DialogHeader>
          <DialogTitle>{props.fixture ? `Edit ${props.fixture.name}` : 'New fixture'}</DialogTitle>
          <DialogDescription>
            Part of the house that items plug into or hang from.
          </DialogDescription>
        </DialogHeader>
        <FixtureFields
          draft={draft}
          world={props.world}
          onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        />
        <DialogFooter className="items-center gap-3 sm:justify-between">
          <p className="text-sm text-muted-foreground">{missing}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => props.onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              disabled={missing !== null}
              onClick={() =>
                props.onSave?.({
                  ...draft,
                  name: draft.name.trim(),
                  note: note === '' ? null : note,
                })
              }
            >
              {props.fixture ? 'Save' : 'Add fixture'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
