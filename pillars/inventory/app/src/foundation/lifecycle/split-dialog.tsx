/**
 * Split some of a group off into a new item: how many, what the new one is
 * called, and where it goes. The sentence under the fields says exactly what
 * the two records will hold afterwards, and the button carries the count.
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
  Input,
  Label,
  NumberInput,
} from '@pops/ui';

import { splitProblem } from './lifecycle-model';

/** Props for {@link SplitDialog}. */
export interface SplitDialogProps {
  itemName: string;
  quantity: number;
  placeName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCount?: number;
  onConfirm?: (count: number, name: string) => void;
}

/** The split dialog. */
export function SplitDialog({
  itemName,
  quantity,
  placeName,
  open,
  onOpenChange,
  initialCount = 1,
  onConfirm,
}: SplitDialogProps) {
  const [count, setCount] = useState(initialCount);
  const [name, setName] = useState(itemName);
  const problem = splitProblem(quantity, count);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Split {itemName}</DialogTitle>
          <DialogDescription>
            Some of the {quantity} become their own item, with their own place and history.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="split-count">Split off</Label>
            <NumberInput
              id="split-count"
              min={1}
              max={quantity - 1}
              step={1}
              showSteppers
              value={Number.isFinite(count) ? count : ''}
              onChange={(event) =>
                setCount(event.target.value === '' ? Number.NaN : Number(event.target.value))
              }
              aria-invalid={problem !== null || undefined}
            />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="split-name">New item name</Label>
            <Input id="split-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
        </div>
        <p role={problem ? 'alert' : undefined} className="text-sm text-muted-foreground">
          {problem ??
            `Leaves ${quantity - count} on this record. Creates ${name} with ${count}, in ${placeName}.`}
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={problem !== null} onClick={() => onConfirm?.(count, name.trim())}>
            Split off {Number.isFinite(count) ? count : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
