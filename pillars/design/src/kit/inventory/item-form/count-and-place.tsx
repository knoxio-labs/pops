/**
 * How many and where. Quantity steps between whole numbers from 1; a
 * container has no quantity, because a container is always one. The place
 * opens the one placement picker: a place, a container, or in hand.
 */
import { ChevronsUpDown, Minus, Plus } from 'lucide-react';
import { useState } from 'react';

import { ButtonPrimitive, Input, Label, cn } from '@pops/ui';

import { FieldProblem, PROBLEM_RING } from '../field-editors/field-note';
import { PlacementPicker } from '../placement-picker/placement-picker';
import { PlacementPath } from '../shared/placement-path';
import { FormField } from './identity-fields';

import type { Placement, PlacementTarget } from '../shared/model';
import type { PlacementWorld } from '../shared/placement-model';

function step(value: string, by: number): string {
  const current = Number.parseInt(value, 10);
  return String(Math.max(1, (Number.isNaN(current) ? 1 : current) + by));
}

/** The quantity stepper; absent for containers. */
export function QuantityField({
  value,
  error,
  onChange,
}: {
  value: string;
  error: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="item-quantity" className="text-sm font-medium">
          Quantity
        </Label>
        <div className="flex items-center">
          <ButtonPrimitive
            variant="outline"
            size="icon-sm"
            aria-label="One fewer"
            onClick={() => onChange(step(value, -1))}
            className="rounded-r-none"
          >
            <Minus className="size-3.5" aria-hidden />
          </ButtonPrimitive>
          <Input
            id="item-quantity"
            value={value}
            inputMode="numeric"
            aria-invalid={error !== null || undefined}
            onChange={(event) => onChange(event.target.value)}
            className={cn(
              'h-9 w-14 rounded-none border-x-0 text-center tabular-nums',
              error !== null && PROBLEM_RING
            )}
          />
          <ButtonPrimitive
            variant="outline"
            size="icon-sm"
            aria-label="One more"
            onClick={() => onChange(step(value, 1))}
            className="rounded-l-none"
          >
            <Plus className="size-3.5" aria-hidden />
          </ButtonPrimitive>
        </div>
      </div>
      {error === null ? null : <FieldProblem>{error}</FieldProblem>}
    </div>
  );
}

/** Props for {@link PlaceField}. */
export interface PlaceFieldProps {
  /** The house with the item being placed in it, so the picker can say what is already there. */
  world: PlacementWorld;
  itemId: string;
  placement: Placement;
  recents: readonly PlacementTarget[];
  onChange: (placement: Placement) => void;
  pickerOpen?: boolean;
}

/** Where the item goes. */
export function PlaceField({
  world,
  itemId,
  placement,
  recents,
  onChange,
  pickerOpen,
}: PlaceFieldProps) {
  const [open, setOpen] = useState(pickerOpen === true);
  return (
    <FormField id="item-place" label="Goes in">
      <PlacementPicker
        world={world}
        subject={{ kind: 'items', ids: [itemId] }}
        recents={recents}
        onPick={(target) => {
          onChange(target);
          setOpen(false);
        }}
        onCreatePlace={() => undefined}
        open={open}
        onOpenChange={setOpen}
        trigger={
          <ButtonPrimitive
            id="item-place"
            variant="outline"
            className="h-9 w-full min-w-0 justify-between gap-2 px-3 font-normal"
          >
            <PlacementPath world={world} placement={placement} maxSegments={3} />
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </ButtonPrimitive>
        }
      />
    </FormField>
  );
}
