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

interface DeleteInstitutionDialogProps {
  deletingId: string | null;
  setDeletingId: (id: string | null) => void;
  isDeleting: boolean;
  onConfirm: (id: string) => void;
}

export function DeleteInstitutionDialog({
  deletingId,
  setDeletingId,
  isDeleting,
  onConfirm,
}: DeleteInstitutionDialogProps) {
  return (
    <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this institution?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the institution. Refused if any account still references it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => deletingId && onConfirm(deletingId)}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
