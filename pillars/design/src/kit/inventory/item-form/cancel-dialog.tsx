/**
 * The one question Cancel asks, and only when leaving would lose something
 * typed or chosen. Discarding a draft cannot be undone, so its button is
 * the red one; keeping the draft is the default.
 */
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

/** Props for {@link CancelDialog}. */
export interface CancelDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  stagedPhotos: number;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
}

function detail(mode: 'create' | 'edit', stagedPhotos: number): string {
  if (mode === 'edit') return 'The item stays as it was before you opened this form.';
  const photos =
    stagedPhotos === 0
      ? ''
      : ` The ${stagedPhotos === 1 ? 'photo' : `${stagedPhotos} photos`} you added will not upload.`;
  return `Nothing has been created yet.${photos}`;
}

/** Asks before throwing staged work away. */
export function CancelDialog({
  open,
  mode,
  stagedPhotos,
  onOpenChange,
  onDiscard,
}: CancelDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {mode === 'create' ? 'Discard this new item?' : 'Discard your changes?'}
          </AlertDialogTitle>
          <AlertDialogDescription>{detail(mode, stagedPhotos)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel autoFocus>
            {mode === 'create' ? 'Keep the draft' : 'Keep editing'}
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDiscard}>
            {mode === 'create' ? 'Discard item' : 'Discard changes'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
