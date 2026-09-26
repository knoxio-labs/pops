import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pops/ui';

import type { ReactElement } from 'react';

/** Props for the form's loss-of-work confirmation. */
export interface CancelDialogProps {
  readonly open: boolean;
  readonly mode: 'create' | 'edit';
  readonly onOpenChange: (open: boolean) => void;
  readonly onDiscard: () => void;
}

/** Confirms cancellation only after the draft differs from its opening state. */
export function CancelDialog({
  open,
  mode,
  onOpenChange,
  onDiscard,
}: CancelDialogProps): ReactElement {
  const title = mode === 'create' ? 'Discard this new item?' : 'Discard your changes?';
  const description =
    mode === 'create'
      ? 'Nothing has been created yet.'
      : 'The item stays as it was before you opened this form.';
  const discardLabel = mode === 'create' ? 'Discard item' : 'Discard changes';
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDiscard}>
            {discardLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
