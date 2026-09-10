import { ACCOUNT_KINDS } from '@/fixtures/account-kinds';
import { type Account } from '@/fixtures/accounts';

import {
  Button,
  DateInput,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldLabel,
  Label,
  Textarea,
  TextInput,
} from '@pops/ui';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Recording what's true right now, not editing what happened before:
 * checkpoints are append-only, so this dialog has no counterpart that loads
 * an existing one to change it. Source is never a field: anything typed here
 * is a manual checkpoint by definition, the only kind a person can create by
 * hand.
 */
export function AddCheckpointDialog({ account }: { account: Account }) {
  const external = ACCOUNT_KINDS[account.kind].checkpointable;
  return (
    <Dialog open>
      <DialogContent className="max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Add checkpoint for {account.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <TextInput
            label={`Balance (${account.currency})`}
            placeholder="0.00"
            defaultValue={(account.balance / 100).toFixed(2)}
          />
          <div className="flex flex-col gap-1.5 w-full">
            <FieldLabel htmlFor="checkpoint-as-of" label="As of" />
            <DateInput id="checkpoint-as-of" defaultValue={today()} />
          </div>
          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Textarea
              placeholder={
                external ? 'Confirmed against the banking app' : 'Counted the notes and coins'
              }
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline">Cancel</Button>
          <Button>Save checkpoint</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
