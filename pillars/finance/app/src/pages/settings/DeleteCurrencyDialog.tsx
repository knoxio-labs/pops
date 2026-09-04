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

interface DeleteCurrencyDialogProps {
  deletingCode: string | null;
  setDeletingCode: (code: string | null) => void;
  isDeleting: boolean;
  onConfirm: (code: string) => void;
}

export function DeleteCurrencyDialog({
  deletingCode,
  setDeletingCode,
  isDeleting,
  onConfirm,
}: DeleteCurrencyDialogProps) {
  return (
    <AlertDialog open={!!deletingCode} onOpenChange={() => setDeletingCode(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this currency?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the currency. Refused if any account still references it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => deletingCode && onConfirm(deletingCode)}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
