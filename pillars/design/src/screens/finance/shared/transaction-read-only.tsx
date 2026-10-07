import { attachments } from '@/fixtures/transaction-attachments';
import { AttachmentsField, EntryDialog } from '@/screens/finance/shared/transaction-attachments';

import { Button } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { Attachment } from '@/fixtures/transaction-attachments';

/**
 * A transaction opened with the `view` role. It is the same dialog with the
 * form taken out: the facts as plain text, the files still openable, and no
 * control that would be refused if it were pressed.
 */
export const meta: ScreenMeta = { title: 'Transaction, view only', order: 29, frame: 'none' };

const SUMMARY = [
  ['Account', 'Your ledger'],
  ['Amount', '$86.00, they paid for you'],
  ['Date', '28 Sep 2026'],
  ['Description', 'Dinner at Sample Trattoria'],
  ['Added by', 'alex@costa.example'],
] as const;

function ReadOnly({ files }: { files: Attachment[] }) {
  return (
    <EntryDialog
      title="Transaction"
      footer={
        <>
          <span className="text-xs text-muted-foreground">You can view this account.</span>
          <Button variant="outline">Close</Button>
        </>
      }
    >
      <AttachmentsField files={files} readOnly />
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        {SUMMARY.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-muted-foreground">{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </EntryDialog>
  );
}

export const states: ScreenStates = {
  'no-files': () => <ReadOnly files={[]} />,
};

export default function TransactionReadOnlyScreen() {
  return <ReadOnly files={attachments} />;
}
