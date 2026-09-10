import { when } from '@/kit/import-status-section';

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

/**
 * What the tab that lost an import sees. It blocks, because every edit
 * made here after the take-over would be thrown away, and a wizard that
 * keeps accepting input it will not save is worse than one that stops.
 * The two ways out are symmetrical with the card's "Take over": take it
 * back, or leave it to the other tab.
 */
export function ImportTakenOverNotice({ takenAt }: { takenAt: string }) {
  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>This import is open somewhere else now</AlertDialogTitle>
          <AlertDialogDescription>
            Another tab took it over at {when(takenAt)}. Anything you change here will not be saved.
            Take it back to keep working here, or leave and let the other tab finish.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Leave</AlertDialogCancel>
          <AlertDialogAction>Take it back</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
