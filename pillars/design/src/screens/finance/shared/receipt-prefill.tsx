import { personLedger } from '@/fixtures/sharing';
import {
  attachments,
  euroReading,
  failedAttachments,
  type ReceiptPrefill,
  trattoriaReading,
} from '@/fixtures/transaction-attachments';
import {
  AttachmentsField,
  EntryDialog,
  EntryFields,
} from '@/screens/finance/shared/transaction-attachments';
import { CircleAlert, CircleCheck, Loader2, ScanText, TriangleAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle, Button } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { Opening } from '@/kit/transaction-sections';
import type { ReactNode } from 'react';

/**
 * Reading a receipt on a new transaction. The person attaches the file, asks
 * for it to be read, and the date, description and amount are filled in for
 * them to check. Nothing is saved by reading: the fields stay editable and
 * Add is still the only thing that writes.
 *
 * Every way a reading can fall short leaves the file attached and the fields
 * in the person's hands, and says which of the two happened.
 */
export const meta: ScreenMeta = { title: 'Receipt prefill', order: 26, frame: 'none' };

const NEW: Opening = { accountId: personLedger.id, date: '2026-10-07' };

function filled(reading: typeof trattoriaReading, withAmount: boolean): Opening {
  return {
    ...NEW,
    date: reading.date,
    description: reading.description,
    amount: withAmount ? reading.amount : undefined,
  };
}

function Notice({
  tone = 'default',
  icon,
  title,
  action,
  children,
}: {
  tone?: 'default' | 'destructive';
  icon: ReactNode;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Alert variant={tone} className="py-2">
      {icon}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {children}
        {action}
      </AlertDescription>
    </Alert>
  );
}

const link = (label: string) => (
  <Button variant="link" size="sm" className="h-auto min-h-0 p-0">
    {label}
  </Button>
);

function PrefillNotice({ prefill }: { prefill: ReceiptPrefill }) {
  switch (prefill.outcome) {
    case 'idle':
      return (
        <Button variant="outline" size="sm" prefix={<ScanText className="h-4 w-4" />}>
          Read receipt
        </Button>
      );
    case 'reading':
      return (
        <Notice icon={<Loader2 className="animate-spin" />} title="Reading the receipt">
          This takes a few seconds. You can keep typing.
        </Notice>
      );
    case 'suggested':
      return (
        <Notice icon={<CircleCheck />} title="Filled in from the receipt" action={link('Undo')}>
          Date, description and amount. Check them before you add it.
        </Notice>
      );
    case 'unreadable':
      return (
        <Notice icon={<CircleAlert />} title="Could not read this receipt">
          The file stays attached. Fill the fields in yourself.
        </Notice>
      );
    case 'unavailable':
      return (
        <Notice
          tone="destructive"
          icon={<TriangleAlert />}
          title="Receipt reading is not available right now"
          action={link('Try again')}
        >
          The file stays attached. Fill the fields in yourself, or try again.
        </Notice>
      );
    case 'mismatch':
      return (
        <Notice icon={<CircleAlert />} title={`This receipt is in ${prefill.reading.currency}`}>
          The account is in {prefill.accountCurrency} and nothing is converted, so the amount was
          left for you. The receipt total is {prefill.reading.currency} {prefill.reading.amount}.
          Date and description were filled in.
        </Notice>
      );
  }
}

const ADD_FOOTER = (
  <>
    <span />
    <span className="flex gap-2">
      <Button variant="outline">Cancel</Button>
      <Button>Add</Button>
    </span>
  </>
);

const adding = (prefill: ReceiptPrefill, opening: Opening = NEW) =>
  function Adding() {
    return (
      <EntryDialog title="Add transaction" footer={ADD_FOOTER}>
        <AttachmentsField files={attachments.slice(0, 1)} />
        <PrefillNotice prefill={prefill} />
        <EntryFields opening={opening} />
      </EntryDialog>
    );
  };

/**
 * The transaction was created and the attach call after it failed. The dialog
 * stays on the saved entry, so trying again can never add a second one.
 */
function SavedButNotAttached() {
  return (
    <EntryDialog
      title="Transaction added"
      footer={
        <>
          <span />
          <span className="flex gap-2">
            <Button variant="outline">Finish without the file</Button>
            <Button>Try attaching again</Button>
          </span>
        </>
      }
    >
      <Notice tone="destructive" icon={<TriangleAlert />} title="1 file did not attach">
        The transaction is saved and will not be added twice. Only the file is missing.
      </Notice>
      <AttachmentsField files={failedAttachments.slice(2)} />
    </EntryDialog>
  );
}

export const states: ScreenStates = {
  'ready-to-read': adding({ outcome: 'idle' }),
  reading: adding({ outcome: 'reading' }),
  unreadable: adding({ outcome: 'unreadable' }),
  unavailable: adding({ outcome: 'unavailable' }),
  'currency-mismatch': adding(
    { outcome: 'mismatch', reading: euroReading, accountCurrency: 'AUD' },
    filled(euroReading, false)
  ),
  'saved-but-not-attached': SavedButNotAttached,
};

export default adding(
  { outcome: 'suggested', reading: trattoriaReading },
  filled(trattoriaReading, true)
);
