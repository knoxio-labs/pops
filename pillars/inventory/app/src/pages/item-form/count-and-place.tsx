import { Minus, Plus } from 'lucide-react';
import { useId } from 'react';

import { Button, Input, Label } from '@pops/ui';

import { INVENTORY_ICONS } from '../../foundation/model/icons';
import { targetName } from '../../foundation/model/placement-model';
import { PlacementPicker } from '../../foundation/placement-picker/placement-picker';

import type { ReactElement } from 'react';

import type { Placement, PlacementTarget } from '../../foundation/model/model';
import type { PlacementWorld } from '../../foundation/model/placement-model';

/** Props for quantity and placement controls. */
export interface CountAndPlaceProps {
  readonly quantity: string;
  readonly showQuantity: boolean;
  readonly quantityError: string | null;
  readonly placement: Placement;
  readonly world: PlacementWorld;
  readonly recents: readonly PlacementTarget[];
  readonly subjectId: string;
  readonly pickerOpen: boolean;
  readonly onPickerOpenChange: (open: boolean) => void;
  readonly onQuantity: (value: string) => void;
  readonly onPick: (target: PlacementTarget) => void;
  readonly onCreatePlace: (name: string, parentId: string | null) => void;
}

function QuantityField({
  quantity,
  quantityError,
  onQuantity,
}: Pick<CountAndPlaceProps, 'quantity' | 'quantityError' | 'onQuantity'>): ReactElement {
  const id = useId();
  const numericQuantity = Number(quantity) || 1;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Quantity</Label>
      <div className="flex max-w-48 items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Decrease quantity"
          onClick={() => onQuantity(String(Math.max(1, numericQuantity - 1)))}
        >
          <Minus className="size-4" aria-hidden />
        </Button>
        <Input
          id={id}
          type="number"
          min={1}
          value={quantity}
          onChange={(event) => onQuantity(event.target.value)}
          aria-invalid={quantityError !== null}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Increase quantity"
          onClick={() => onQuantity(String(numericQuantity + 1))}
        >
          <Plus className="size-4" aria-hidden />
        </Button>
      </div>
      {quantityError ? <p className="text-sm text-destructive">{quantityError}</p> : null}
    </div>
  );
}

function PlaceField({
  placement,
  world,
  recents,
  subjectId,
  pickerOpen,
  onPickerOpenChange,
  onPick,
  onCreatePlace,
}: Omit<
  CountAndPlaceProps,
  'quantity' | 'showQuantity' | 'quantityError' | 'onQuantity'
>): ReactElement {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Place</Label>
      <PlacementPicker
        world={world}
        subject={{ kind: 'items', ids: [subjectId] }}
        recents={recents}
        open={pickerOpen}
        onOpenChange={onPickerOpenChange}
        onPick={onPick}
        onCreatePlace={onCreatePlace}
        trigger={
          <Button
            id={id}
            type="button"
            variant="outline"
            className="w-full justify-start"
            prefix={<INVENTORY_ICONS.location className="size-4" aria-hidden />}
          >
            {targetName(world, placement)}
          </Button>
        }
      />
    </div>
  );
}

/** Renders quantity when applicable and the shared placement picker. */
export function CountAndPlace(props: CountAndPlaceProps): ReactElement {
  return (
    <div className="space-y-5">
      <PlaceField {...props} />
      {props.showQuantity ? (
        <QuantityField
          quantity={props.quantity}
          quantityError={props.quantityError}
          onQuantity={props.onQuantity}
        />
      ) : null}
    </div>
  );
}
