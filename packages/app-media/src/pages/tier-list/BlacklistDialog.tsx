import { useTranslation } from 'react-i18next';
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

export function BlacklistDialog({
  blacklistTarget,
  onCancel,
  onConfirm,
  isPending,
}: {
  blacklistTarget: { id: number; title: string } | null;
  onCancel: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  return (
    <AlertDialog
      open={blacklistTarget !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('blacklist.markAsNotWatched')}</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove <strong>{blacklistTarget?.title}</strong> from all comparisons and
            rankings across every dimension. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Removing\u2026' : 'Not watched'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
