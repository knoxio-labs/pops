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

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Label a resumable run by its source files without spilling a long list into
 * the prompt. The multi-file form goes through i18n rather than being assembled
 * here, so a non-English locale does not render an English fragment.
 */
function describeSourceFiles(names: string[], t: Translate): string {
  const [first, ...rest] = names;
  if (!first) return 'CSV';
  if (rest.length === 0) return first;
  return t('import.resumeFileSummary', { fileName: first, extraCount: rest.length });
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
              fileName: describeSourceFiles(sourceFileNames, t),
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
