import { currenciesByCode } from '@/fixtures/currencies';
import { asGuestSees, personLedger, sharedAccounts } from '@/fixtures/sharing';
import {
  type Attachment,
  attachments,
  failedAttachments,
  MAX_FILE_SIZE_LABEL,
  uploadingAttachments,
} from '@/fixtures/transaction-attachments';
import { AmountField, DirectionField } from '@/kit/transaction-amount';
import { AccountField, DateField, DescriptionField } from '@/kit/transaction-fields';
import { type Opening, useDraft } from '@/kit/transaction-sections';
import { TileFace } from '@/screens/finance/shared/attachment-viewer';
import { Paperclip, Plus, X } from 'lucide-react';

import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Skeleton,
} from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { ReactNode } from 'react';

/**
 * Files on a transaction. They sit above the fields because on a new entry
 * the receipt comes first: it is photographed, read, and the fields follow
 * from it. The strip is one row that scrolls sideways, so the dialog is the
 * same height with one file or with ten.
 *
 * The form drawn here is the one a guest gets: no entity, no tags. The
 * operator's dialog keeps both and gains the same strip in the same place.
 */
export const meta: ScreenMeta = { title: 'Transaction files', order: 24, frame: 'none' };

function Tile({ file, readOnly }: { file: Attachment; readOnly: boolean }) {
  const failed = file.upload?.state === 'failed';
  return (
    <li className="relative w-20 shrink-0 pt-1.5 pr-1.5">
      <button
        type="button"
        aria-label={failed ? `Retry ${file.name}` : `Open ${file.name}`}
        className={cn(
          'block h-16 w-full overflow-hidden rounded-md border bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          failed ? 'border-destructive' : 'border-border'
        )}
      >
        <TileFace file={file} />
      </button>
      {!readOnly && (
        <button
          type="button"
          aria-label={`Remove ${file.name}`}
          className="absolute top-0 right-0 inline-flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground"
        >
          <X className="size-3" aria-hidden />
        </button>
      )}
      <span className="mt-1 block truncate text-2xs text-muted-foreground">{file.name}</span>
    </li>
  );
}

function AddTile({ wide }: { wide: boolean }) {
  return (
    <li className={cn('shrink-0 pt-1.5', wide ? 'flex-1' : 'w-20')}>
      <button
        type="button"
        className="flex h-16 w-full items-center justify-center gap-2 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {wide ? (
          <Paperclip className="size-4" aria-hidden />
        ) : (
          <Plus className="size-4" aria-hidden />
        )}
        {wide ? 'Add photos or a PDF of the receipt' : 'Add'}
      </button>
    </li>
  );
}

export type FilesLoad = 'ready' | 'loading' | 'error';

/** The strip of files on a transaction: open one, remove one, add more. `readOnly` is the `view` role. */
export function AttachmentsField({
  files,
  readOnly = false,
  load = 'ready',
  problem,
}: {
  files: Attachment[];
  readOnly?: boolean;
  load?: FilesLoad;
  problem?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <Label>Files</Label>
        <span className="text-2xs text-muted-foreground">
          {readOnly
            ? `${files.length} attached`
            : `Photos or a PDF, up to ${MAX_FILE_SIZE_LABEL} each`}
        </span>
      </div>
      {load === 'loading' && <Skeleton className="h-16 w-full" />}
      {load === 'error' && (
        <p className="flex h-16 items-center gap-2 text-xs text-muted-foreground">
          Could not load the files. The rest of the transaction is unaffected.
          <Button variant="link" size="sm">
            Try again
          </Button>
        </p>
      )}
      {load === 'ready' && (
        <ul className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Attached files">
          {files.map((file) => (
            <Tile key={file.id} file={file} readOnly={readOnly} />
          ))}
          {!readOnly && <AddTile wide={files.length === 0} />}
          {readOnly && files.length === 0 && (
            <li className="flex h-16 items-center text-xs text-muted-foreground">No files.</li>
          )}
        </ul>
      )}
      {problem && <p className="text-xs text-destructive">{problem}</p>}
    </div>
  );
}

/** The lean fields a guest fills in: direction, account, amount, date, description. */
export function EntryFields({ opening }: { opening: Opening }) {
  const f = useDraft(opening);
  return (
    <div className="space-y-3">
      <DirectionField value={f.draft.type} onChange={f.setType} />
      <AccountField label="Account" accounts={ENTRY_ACCOUNTS} initialId={opening.accountId} />
      <div className="grid grid-cols-2 gap-3">
        <AmountField
          value={f.draft.amount}
          onChange={f.setAmount}
          symbol={currenciesByCode.get(f.currency)?.symbol ?? ''}
        />
        <DateField value={f.draft.date} onChange={f.setDate} />
      </div>
      <DescriptionField value={f.draft.description} onChange={f.setDescription} />
    </div>
  );
}

/** The accounts the picker offers: for a guest, only those shared with `edit`. */
const ENTRY_ACCOUNTS = sharedAccounts
  .filter((shared) => shared.role === 'edit')
  .map((shared) => asGuestSees(shared.account));

/** The dialog every transaction screen in this group is staged in. It never scrolls. */
export function EntryDialog({
  title,
  footer,
  children,
}: {
  title: string;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog open>
      <DialogContent className="max-w-lg gap-3" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
        <DialogFooter className="sm:justify-between">{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const EDITING: Opening = {
  editing: true,
  accountId: personLedger.id,
  amount: '86.00',
  date: '2026-09-28',
  description: 'Dinner at Sample Trattoria',
};

/** Delete on the left, away from the two buttons a hand reaches for. */
export const EDIT_FOOTER = (
  <>
    <Button variant="ghost" className="text-destructive">
      Delete
    </Button>
    <span className="flex gap-2">
      <Button variant="outline">Cancel</Button>
      <Button>Save changes</Button>
    </span>
  </>
);

type FieldProps = Parameters<typeof AttachmentsField>[0];

const editing = (props: FieldProps) => () => (
  <EntryDialog title="Edit transaction" footer={EDIT_FOOTER}>
    <AttachmentsField {...props} />
    <EntryFields opening={EDITING} />
  </EntryDialog>
);

export const states: ScreenStates = {
  none: editing({ files: [] }),
  uploading: editing({ files: uploadingAttachments }),
  'upload-failed': editing({
    files: failedAttachments,
    problem: 'card-slip.jpg did not upload. Select it to try again, or remove it.',
  }),
  'too-large': editing({
    files: attachments.slice(0, 2),
    problem: `scan-all-pages.pdf is 48 MB. Files can be up to ${MAX_FILE_SIZE_LABEL} each, so it was not added.`,
  }),
  loading: editing({ files: [], load: 'loading' }),
  error: editing({ files: [], load: 'error' }),
};

export default editing({ files: attachments });
