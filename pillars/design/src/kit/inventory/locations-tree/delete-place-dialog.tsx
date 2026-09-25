/**
 * Deleting a place that holds things. A deleted place cannot be brought
 * back, so this is one of the few confirmations: two outcomes, each stated
 * in full with its counts, and a red button that says which one it does.
 * A top-level place has no parent to move things to, so only the second
 * outcome is open and the first says why.
 */
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  RadioGroup,
  RadioGroupItem,
  cn,
} from '@pops/ui';

import { deleteButtonLabel, deleteOutcome, planDelete } from './delete-plan';

import type { PlacementWorld } from '../foundation';
import type { DeleteMode, DeletePlan } from './delete-plan';
import type { PendingDelete } from './use-place-edits';

/** Props for {@link DeletePlaceDialog}. */
export interface DeletePlaceDialogProps {
  world: PlacementWorld;
  pending: PendingDelete | null;
  onModeChange: (mode: DeleteMode) => void;
  onConfirm: (plan: DeletePlan) => void;
  onCancel: () => void;
}

const TITLES: Readonly<Record<DeleteMode, string>> = {
  reparent: 'Keep what is inside',
  'to-hand': 'Delete with contents',
};

function Option({ plan, checked }: { plan: DeletePlan; checked: boolean }) {
  const id = `delete-${plan.mode}`;
  const refused = plan.refusal !== null;
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border p-3',
        checked ? 'border-app-accent bg-app-accent/10' : 'border-border',
        refused && 'cursor-not-allowed opacity-60'
      )}
    >
      <RadioGroupItem id={id} value={plan.mode} disabled={refused} className="mt-0.5" />
      <span className="min-w-0 space-y-0.5">
        <span className="block text-sm font-medium">{TITLES[plan.mode]}</span>
        <span className="block text-sm text-muted-foreground">
          {plan.refusal ?? deleteOutcome(plan)}
        </span>
      </span>
    </label>
  );
}

function Body({
  world,
  pending,
  onModeChange,
  onConfirm,
}: DeletePlaceDialogProps & { pending: PendingDelete }) {
  const plans = {
    reparent: planDelete(world, pending.placeId, 'reparent'),
    'to-hand': planDelete(world, pending.placeId, 'to-hand'),
  };
  const chosen = plans[pending.mode];
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete {chosen.place.name}?</AlertDialogTitle>
        <AlertDialogDescription>
          A deleted place cannot be restored. Choose what happens to what is in it.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <RadioGroup
        value={pending.mode}
        onValueChange={(value) => onModeChange(value === 'to-hand' ? 'to-hand' : 'reparent')}
        className="gap-2"
        aria-label="What happens to what is inside"
      >
        <Option plan={plans.reparent} checked={pending.mode === 'reparent'} />
        <Option plan={plans['to-hand']} checked={pending.mode === 'to-hand'} />
      </RadioGroup>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <Button
          variant="destructive"
          disabled={chosen.refusal !== null}
          onClick={() => onConfirm(chosen)}
        >
          {deleteButtonLabel(chosen)}
        </Button>
      </AlertDialogFooter>
    </>
  );
}

/** The delete confirmation. Renders closed while nothing is pending. */
export function DeletePlaceDialog(props: DeletePlaceDialogProps) {
  const { pending } = props;
  return (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => (open ? undefined : props.onCancel())}
    >
      <AlertDialogContent className="sm:max-w-lg">
        {pending === null ? null : <Body {...props} pending={pending} />}
      </AlertDialogContent>
    </AlertDialog>
  );
}
