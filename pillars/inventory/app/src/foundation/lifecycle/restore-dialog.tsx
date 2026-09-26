/**
 * Restore and Found it: back to active use, which means back somewhere. The
 * dialog asks only where it is now, offering the place it was and In hand
 * (you found it, so you likely hold it), with the picker for anything else.
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
  RadioInput,
} from '@pops/ui';

import { restoreLabel } from './lifecycle-model';

import type { Lifecycle } from '../model';

/** Props for {@link RestoreDialog}. */
export interface RestoreDialogProps {
  itemName: string;
  lifecycle: Exclude<Lifecycle, 'active' | 'destroyed'>;
  /** Where it was when it left active use, by name. */
  lastPlace: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm?: (where: 'last-place' | 'in-hand' | 'choose') => void;
}

/** The restore dialog. */
export function RestoreDialog({
  itemName,
  lifecycle,
  lastPlace,
  open,
  onOpenChange,
  onConfirm,
}: RestoreDialogProps) {
  const [where, setWhere] = useState<'last-place' | 'in-hand' | 'choose'>(
    lifecycle === 'lost' ? 'in-hand' : 'last-place'
  );
  const label = `${restoreLabel(lifecycle)}: ${itemName}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            It goes back into lists and totals. Choose where it is now.
          </DialogDescription>
        </DialogHeader>
        <RadioInput
          label="Where it is now"
          value={where}
          onValueChange={(value) =>
            setWhere(value === 'in-hand' || value === 'choose' ? value : 'last-place')
          }
          options={[
            {
              value: 'in-hand',
              label: 'In hand',
              description: 'You have it with you. Put it away later.',
            },
            {
              value: 'last-place',
              label: lastPlace,
              description: 'Where it was when it left use.',
            },
            {
              value: 'choose',
              label: 'Somewhere else',
              description: 'Opens the place picker next.',
            },
          ]}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm?.(where)}>{restoreLabel(lifecycle)}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
