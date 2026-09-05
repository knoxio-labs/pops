import { type Account } from '@/fixtures/accounts';

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

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Recording what's true right now, not editing what happened before —
 * checkpoints are append-only, so this dialog has no counterpart that loads
 * an existing one to change it. Source is never a field: anything typed here
 * is a manual checkpoint by definition, the only kind a person can create by
 * hand.
 */
export function AddCheckpointDialog({ account }: { account: Account }) {
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
          <TextInput label="As of" type="date" defaultValue={today()} />
          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Textarea placeholder="Confirmed against the banking app" rows={2} />
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
