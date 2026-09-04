import { History } from 'lucide-react';

import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertTitle,
} from '@pops/ui';

import { choiceOf } from './import/context';
import { ImportContextStrip } from './import/upload';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Import — resume prompt', order: 2, frame: 'web' };

const CHOICE = choiceOf('a2', 'amex-csv');

/**
 * Label a resumable run by its source files the same way the shipping
 * `ResumeImportDialog` does, without a long list spilling into the prompt.
 */
function describeSourceFiles(names: string[]): string {
  const [first, ...rest] = names;
  if (!first) return 'CSV';
  if (rest.length === 0) return first;
  return `${first} and ${rest.length} more`;
}

function WizardBehind() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6 opacity-40" aria-hidden>
      <ImportContextStrip choice={CHOICE} editable={false} />
      <div className="h-40 rounded-lg border border-dashed border-border bg-muted/40" />
      <div className="h-24 rounded-lg border border-border bg-muted/40" />
    </div>
  );
}

function Screen({
  sourceFiles,
  parsedCount,
  step,
  deadSession = false,
}: {
  sourceFiles: string[];
  parsedCount: number;
  step: string;
  deadSession?: boolean;
}) {
  return (
    <div className="relative min-h-full">
      <WizardBehind />
      <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-24">
        <div className="pointer-events-auto w-full max-w-md space-y-4 px-4">
          {deadSession && (
            <Alert>
              <AlertTitle>The server lost track of this import</AlertTitle>
              <AlertDescription>
                Likely a deploy while it was processing. Nothing was lost — resuming simply re-runs
                processing from your saved rows.
              </AlertDescription>
            </Alert>
          )}
          <AlertDialog open>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <History className="h-4 w-4" aria-hidden />
                  Resume your import?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {describeSourceFiles(sourceFiles)}, {parsedCount} transactions parsed, stopped at{' '}
                  {step}.
                  {step === 'Process' &&
                    ' Resuming restarts processing from scratch — it does not reattach to the run that stopped.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel variant="destructive">Discard</AlertDialogCancel>
                <AlertDialogAction>Resume</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}

export default function ImportResumeDialog() {
  return <Screen sourceFiles={['Transactions.csv']} parsedCount={8} step="Review" />;
}

export const states: ScreenStates = {
  'multi-file': () => (
    <Screen
      sourceFiles={['Transactions.csv', 'Savings.csv', 'Credit.csv']}
      parsedCount={142}
      step="Tags"
    />
  ),
  'mid-processing': () => (
    <Screen sourceFiles={['Transactions.csv']} parsedCount={0} step="Process" />
  ),
  'dead-session-recovery': () => (
    <Screen sourceFiles={['Transactions.csv']} parsedCount={8} step="Process" deadSession />
  ),
};
