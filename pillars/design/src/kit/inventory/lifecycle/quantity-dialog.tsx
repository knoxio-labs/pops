/**
 * Change how many identical things one record stands for. Never zero: the
 * dialog says to discard instead, and a container cannot be a group.
 */
import { useState } from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  NumberInput,
} from '@pops/ui';

import { quantityProblem } from './lifecycle-model';

/** Props for {@link QuantityDialog}. */
export interface QuantityDialogProps {
  itemName: string;
  quantity: number;
  isContainer?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValue?: number;
  onConfirm?: (next: number) => void;
}

/** The change-quantity dialog. */
export function QuantityDialog({
  itemName,
  quantity,
  isContainer = false,
  open,
  onOpenChange,
  initialValue,
  onConfirm,
}: QuantityDialogProps) {
  const [next, setNext] = useState(initialValue ?? quantity);
  const problem = quantityProblem(quantity, next, isContainer);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Change quantity</DialogTitle>
          <DialogDescription>
            {itemName} is {quantity} today. The change is recorded in its history.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="quantity-next">Quantity</Label>
          <NumberInput
            id="quantity-next"
            min={1}
            step={1}
            showSteppers
            value={Number.isFinite(next) ? next : ''}
            onChange={(event) =>
              setNext(event.target.value === '' ? Number.NaN : Number(event.target.value))
            }
            aria-invalid={problem !== null && next !== quantity ? true : undefined}
          />
          {problem !== null && next !== quantity ? (
            <p role="alert" className="text-sm text-muted-foreground">
              {problem}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={problem !== null} onClick={() => onConfirm?.(next)}>
            {problem === null ? `Set to ${next}` : 'Set quantity'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
