import { AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  LoadingProgressStep,
  PageHeader,
} from '@pops/ui';

import { choiceOf, type ImportChoice } from './context';
import { ImportContextStrip } from './upload';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Process', order: 4, frame: 'web' };

interface FictionalWarning {
  title: string;
  description: string;
}

function WarningCard({ warning }: { warning: FictionalWarning }) {
  return (
    <Alert className="w-full max-w-md border-warning/25 bg-warning/10">
      <AlertTriangle className="text-warning" aria-hidden />
      <AlertTitle>{warning.title}</AlertTitle>
      <AlertDescription>
        <p>{warning.description}</p>
      </AlertDescription>
      <Button variant="ghost" size="sm" className="col-start-2 justify-self-start">
        Dismiss
      </Button>
    </Alert>
  );
}

function FatalErrorPanel({ message }: { message: string }) {
  return (
    <Alert variant="destructive" className="w-full max-w-md">
      <AlertTriangle aria-hidden />
      <AlertTitle>Processing failed</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        <Button variant="ghost" size="sm" className="mt-1 text-destructive hover:text-destructive">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function ContinueButton() {
  return (
    <Button>
      <ArrowRight className="h-4 w-4" />
      Continue to Review
    </Button>
  );
}

function Step({
  choice,
  message,
  progress,
  done = false,
  warnings = NO_WARNINGS,
  failed,
  showContinue = false,
}: {
  choice: ImportChoice;
  message: string;
  progress?: number;
  done?: boolean;
  warnings?: FictionalWarning[];
  failed?: string;
  showContinue?: boolean;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <PageHeader title="Process the import" description="Deduplicating and classifying rows." />
      <ImportContextStrip choice={choice} editable={false} />
      <div className="flex flex-col items-center space-y-4">
        {!failed && (
          <LoadingProgressStep
            title="Processing"
            message={message}
            progress={progress}
            done={done}
          />
        )}
        {warnings.map((warning) => (
          <WarningCard key={warning.title} warning={warning} />
        ))}
        {failed && <FatalErrorPanel message={failed} />}
        {showContinue && <ContinueButton />}
      </div>
    </div>
  );
}

const NO_WARNINGS: FictionalWarning[] = [];

const AMEX = choiceOf('a2', 'amex-csv');

export default function ImportProcessStep() {
  return <Step choice={AMEX} message="Classifying 128 of 214 transactions…" progress={60} />;
}

export const states: ScreenStates = {
  'already-processed': () => (
    <Step
      choice={AMEX}
      message="Your transactions are ready for review. Nothing to re-run."
      done
      showContinue
    />
  ),
  'with-warnings': () => (
    <Step
      choice={AMEX}
      message="Processed 214 of 214 transactions."
      done
      warnings={[
        {
          title: '12 rows share checksums with an earlier file in this batch',
          description: 'They were skipped as duplicates. You can review them in the next step.',
        },
        {
          title: '3 rows had an unparseable amount and were skipped',
          description: 'Fix the source file and re-import if these rows matter.',
        },
      ]}
      showContinue
    />
  ),
  failed: () => (
    <Step
      choice={AMEX}
      message="Processing 92 of 214 transactions…"
      progress={43}
      failed="Categorization service timed out after 30s. No rows were written."
    />
  ),
  retrying: () => <Step choice={AMEX} message="Checking for duplicates…" progress={4} />,
};
