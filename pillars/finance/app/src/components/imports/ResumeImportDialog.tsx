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

import { useImportStore } from '../../store/importStore';

interface ResumeImportDialogProps {
  open: boolean;
  onResume: () => void;
  onDiscard: () => void;
}

/**
 * Resume/Discard prompt shown when a persisted, uncommitted import wizard run
 * is found on mount. Resume mounts the wizard at the clamped step; Discard
 * resets store + persisted copy.
 */
export function ResumeImportDialog({ open, onResume, onDiscard }: ResumeImportDialogProps) {
  const { t } = useTranslation('finance');
  const sourceFileName = useImportStore((s) => s.sourceFileName);
  const parsedCount = useImportStore((s) => s.parsedTransactions.length);
  const rowCount = useImportStore((s) => s.rows.length);
  const currentStep = useImportStore((s) => s.currentStep);
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('import.resumeTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('import.resumeDescription', {
              fileName: sourceFileName ?? 'CSV',
              count: parsedCount > 0 ? parsedCount : rowCount,
              step: currentStep,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="destructive" onClick={onDiscard}>
            {t('import.resumeDiscard')}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onResume}>{t('import.resumeConfirm')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
