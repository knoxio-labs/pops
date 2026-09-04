import { AccountAvatar } from '@/screens/finance/account-chip';
import { FileText, FileWarning, UploadCloud } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle, Button, cn, PageHeader } from '@pops/ui';

import { choiceOf, type ImportChoice } from './context';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Upload', order: 2, frame: 'web' };

/**
 * The two decisions the first step made, restated on every step after it with
 * the way back to change either. A wizard that hides what it decided earlier
 * is how a statement ends up in the wrong account.
 */
export function ImportContextStrip({
  choice,
  editable = true,
}: {
  choice: ImportChoice;
  editable?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
      <AccountAvatar account={choice.account} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{choice.account.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          Read as {choice.format.label}
        </span>
      </span>
      {editable && (
        <Button variant="outline" size="sm">
          Change account or format
        </Button>
      )}
    </div>
  );
}

function DropZone({ dragging = false }: { dragging?: boolean }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-12 text-center',
        dragging ? 'border-primary bg-primary/5' : 'border-border'
      )}
    >
      <UploadCloud className="h-8 w-8 text-muted-foreground/50" aria-hidden />
      <p className="text-sm font-medium">Drop the export here</p>
      <p className="text-xs text-muted-foreground">or</p>
      <Button variant="outline" size="sm">
        Choose a file
      </Button>
    </div>
  );
}

function ChosenFile({ name, detail }: { name: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border px-4 py-3">
      <FileText className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
      <Button variant="ghost" size="sm">
        Remove
      </Button>
    </div>
  );
}

function WrongFormat({ choice }: { choice: ImportChoice }) {
  return (
    <Alert variant="destructive">
      <FileWarning aria-hidden />
      <AlertTitle>This does not look like {choice.format.label}</AlertTitle>
      <AlertDescription>
        <p>
          The first row reads{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            Date,Description,Debit,Credit,Balance
          </code>
          , and {choice.format.label} has no header row. Nothing has been read.
        </p>
        <p>Either the file is a different export, or the format above is the wrong one for it.</p>
        <span className="mt-1 flex gap-2">
          <Button size="sm" variant="outline">
            Change the format
          </Button>
          <Button size="sm" variant="outline">
            Choose another file
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}

function Step({
  choice,
  file,
  dragging,
  mismatched = false,
}: {
  choice: ImportChoice;
  file?: { name: string; detail: string };
  dragging?: boolean;
  mismatched?: boolean;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <PageHeader
        title="Upload the file"
        description={`Accepted for this format: ${choice.format.extensions}.`}
      />
      <ImportContextStrip choice={choice} />
      {mismatched && <WrongFormat choice={choice} />}
      {file ? (
        <ChosenFile name={file.name} detail={file.detail} />
      ) : (
        <DropZone dragging={dragging} />
      )}
    </div>
  );
}

const AMEX = choiceOf('a2', 'amex-csv');

export default function ImportUploadStep() {
  return <Step choice={AMEX} />;
}

export const states: ScreenStates = {
  dragging: () => <Step choice={AMEX} dragging />,
  'file-chosen': () => (
    <Step
      choice={AMEX}
      file={{ name: 'activity_2026-08.csv', detail: '18 KB · 8 rows · 24 Aug – 28 Aug 2026' }}
    />
  ),
  'wrong-format-file': () => (
    <Step
      choice={choiceOf('a1', 'anz-csv')}
      file={{ name: 'Transactions.csv', detail: '31 KB · header row found' }}
      mismatched
    />
  ),
};
