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

/** Label a resumable run by its source files without spilling a long list into the prompt. */
export function describeSourceFiles(names: string[]): string {
  const [first, ...rest] = names;
  if (!first) return 'CSV';
  if (rest.length === 0) return first;
  return `${first} and ${rest.length} more`;
}

/**
 * Resume/Discard prompt shown when a persisted, uncommitted import wizard run
 * is found on mount. Resume mounts the wizard at the clamped step; Discard
 * resets store + persisted copy.
 */
export function ResumeImportDialog({ open, onResume, onDiscard }: ResumeImportDialogProps) {
  const { t } = useTranslation('finance');
  const sourceFileNames = useImportStore((s) => s.sourceFileNames);
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
              fileName: describeSourceFiles(sourceFileNames),
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
