import { useEffect } from 'react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  RadioGroup,
  RadioGroupItem,
  cn,
} from '@pops/ui';

import { useDeleteScope } from '../../inventory-web/useDeleteScope.js';
import { deleteButtonLabel, deleteOutcome, isEmptyPlace, planDelete } from './delete-plan.js';

import type { ReactElement } from 'react';

import type { DeleteMode, DeletePlan } from './delete-plan.js';

/** A place deletion waiting for the user to choose its outcome. */
export interface PendingDelete {
  placeId: string;
  mode: DeleteMode;
}

/** Props for the place deletion outcome dialog. */
export interface DeletePlaceDialogProps {
  pending: PendingDelete | null;
  onModeChange: (mode: DeleteMode) => void;
  onConfirm: (plan: DeletePlan) => void;
  onCancel: () => void;
}

const TITLES: Readonly<Record<DeleteMode, string>> = {
  reparent: 'Keep what is inside',
  'to-hand': 'Delete with contents',
};

function Option({ plan, checked }: { plan: DeletePlan; checked: boolean }): ReactElement {
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

function DeleteChoices({
  plans,
  mode,
  onModeChange,
}: {
  plans: Readonly<Record<DeleteMode, DeletePlan>>;
  mode: DeleteMode;
  onModeChange: (mode: DeleteMode) => void;
}): ReactElement {
  return (
    <RadioGroup
      value={mode}
      onValueChange={(value) => onModeChange(value === 'to-hand' ? 'to-hand' : 'reparent')}
      aria-label="What happens to what is inside"
      className="gap-2"
    >
      <Option plan={plans.reparent} checked={mode === 'reparent'} />
      <Option plan={plans['to-hand']} checked={mode === 'to-hand'} />
    </RadioGroup>
  );
}

function PendingDialog(
  props: DeletePlaceDialogProps & { pending: PendingDelete }
): ReactElement | null {
  const scope = useDeleteScope(props.pending.placeId);
  const place = scope.world.locations.get(props.pending.placeId);

  useEffect(() => {
    if (scope.status === 'error') {
      toast.error(
        `Could not check what ${place?.name ?? 'this place'} holds. Nothing was deleted.`
      );
      props.onCancel();
      return;
    }
    if (scope.status === 'success' && place !== undefined && isEmptyPlace(scope.world, place.id)) {
      props.onConfirm(planDelete(scope.world, place.id, props.pending.mode));
    }
  }, [place, props, scope]);

  if (scope.status !== 'success' || place === undefined || isEmptyPlace(scope.world, place.id)) {
    return null;
  }
  const plans = {
    reparent: planDelete(scope.world, place.id, 'reparent'),
    'to-hand': planDelete(scope.world, place.id, 'to-hand'),
  };
  const selected = plans[props.pending.mode];
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) props.onCancel();
      }}
    >
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {place.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            A deleted place cannot be restored. Choose what happens to what is in it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <DeleteChoices plans={plans} mode={props.pending.mode} onModeChange={props.onModeChange} />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={selected.refusal !== null}
            onClick={() => props.onConfirm(selected)}
          >
            {deleteButtonLabel(selected)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Loads deletion scope and renders the outcome dialog only when a decision is required. */
export function DeletePlaceDialog(props: DeletePlaceDialogProps): ReactElement | null {
  return props.pending === null ? null : <PendingDialog {...props} pending={props.pending} />;
}
