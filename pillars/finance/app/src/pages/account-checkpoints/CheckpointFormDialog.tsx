import { getAccountKindBehaviour } from '@pops/finance';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
  TextInput,
} from '@pops/ui';

import { today } from './types';

import type { UseFormReturn } from 'react-hook-form';

import type { Account } from '../accounts/types';
import type { CheckpointFormValues } from './types';

interface CheckpointFormDialogProps {
  account: Account;
  currencyCode: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: UseFormReturn<CheckpointFormValues>;
  onSubmit: (values: CheckpointFormValues) => void;
  isSubmitting: boolean;
}

/**
 * Recording what's true right now, not editing what happened before —
 * checkpoints are append-only (ADR-051), so this dialog has no counterpart
 * that loads an existing one to change it. Source is never a field:
 * anything saved here is a manual checkpoint by definition. The balance
 * label and the note placeholder both branch on the account kind's real
 * ledger behaviour (`@pops/finance`), not a guess baked into the form.
 */
export function CheckpointFormDialog({
  account,
  currencyCode,
  open,
  onOpenChange,
  form,
  onSubmit,
  isSubmitting,
}: CheckpointFormDialogProps) {
  const { signConvention, hasExternalBalance } = getAccountKindBehaviour(account.kind);
  const isLiability = signConvention === 'liability';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add checkpoint for {account.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <TextInput
            type="number"
            step="0.01"
            label={isLiability ? `Amount owed (${currencyCode})` : `Balance (${currencyCode})`}
            placeholder="0.00"
            {...form.register('amount')}
            error={form.formState.errors.amount?.message}
          />
          <TextInput
            type="date"
            label="As of"
            max={today()}
            {...form.register('asOf')}
            error={form.formState.errors.asOf?.message}
          />
          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Textarea
              placeholder={
                hasExternalBalance
                  ? 'Confirmed against the banking app'
                  : 'Counted the notes and coins'
              }
              rows={2}
              {...form.register('note')}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={form.handleSubmit(onSubmit)} disabled={isSubmitting}>
            Save checkpoint
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
