import { type Attachment, attachments } from '@/fixtures/transaction-attachments';
import { ChevronLeft, ChevronRight, Download, FileText, Trash2, TriangleAlert } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Progress,
} from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';

/**
 * One attached file, opened from its tile. A photo is shown; a PDF has no
 * preview to show, so it offers the original instead of pretending to render
 * one. Removing asks first, because on a saved transaction it happens at once
 * rather than waiting for Save.
 */
export const meta: ScreenMeta = { title: 'File viewer', order: 25, frame: 'none' };

/** A stand-in for a photographed receipt: the playground ships no images of real paper. */
export function ReceiptThumb({ className }: { className?: string }) {
  return (
    <span className={cn('flex h-full flex-col gap-1 bg-card p-2', className)} aria-hidden>
      <span className="h-1.5 w-1/2 rounded-sm bg-foreground/40" />
      <span className="h-1 w-full rounded-sm bg-foreground/15" />
      <span className="h-1 w-3/4 rounded-sm bg-foreground/15" />
      <span className="h-1 w-full rounded-sm bg-foreground/15" />
      <span className="mt-auto h-1.5 w-2/3 self-end rounded-sm bg-foreground/40" />
    </span>
  );
}

const CENTRED = 'flex h-full flex-col items-center justify-center gap-0.5 text-2xs';

/** What a file's tile shows: its thumbnail, its upload progress, or that the upload failed. */
export function TileFace({ file }: { file: Attachment }) {
  if (file.upload?.state === 'uploading') {
    return (
      <span className="flex h-full flex-col justify-end gap-1 p-1.5 text-2xs text-muted-foreground">
        {file.upload.percent}%
        <Progress value={file.upload.percent} aria-label={`Uploading ${file.name}`} />
      </span>
    );
  }
  if (file.upload?.state === 'failed') {
    return (
      <span className={cn(CENTRED, 'text-destructive')}>
        <TriangleAlert className="size-4" aria-hidden />
        Retry
      </span>
    );
  }
  if (file.kind === 'photo') return <ReceiptThumb />;
  return (
    <span className={cn(CENTRED, 'text-muted-foreground')}>
      <FileText className="size-5" aria-hidden />
      PDF · {file.pages} pages
    </span>
  );
}

function Stage({ file }: { file: Attachment }) {
  if (file.kind === 'photo') {
    return (
      <div className="mx-auto h-80 w-60 overflow-hidden rounded-md border border-border">
        <ReceiptThumb className="gap-3 p-6" />
      </div>
    );
  }
  return (
    <div className="flex h-80 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border text-sm text-muted-foreground">
      <FileText className="size-10" aria-hidden />
      A PDF has no preview here.
      <Button variant="outline" size="sm" prefix={<Download className="h-4 w-4" />}>
        Open the PDF
      </Button>
    </div>
  );
}

function Viewer({ index, readOnly = false }: { index: number; readOnly?: boolean }) {
  const file = attachments[index];
  if (!file) return null;
  return (
    <Dialog open>
      <DialogContent className="max-w-lg gap-3">
        <DialogHeader>
          <DialogTitle className="truncate pr-10">{file.name}</DialogTitle>
          <DialogDescription>
            File {index + 1} of {attachments.length} · {file.size}
          </DialogDescription>
        </DialogHeader>
        <Stage file={file} />
        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <span className="flex gap-1">
            <Button variant="outline" size="icon" aria-label="Previous file" disabled={index === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next file"
              disabled={index === attachments.length - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </span>
          <span className="flex gap-1">
            <Button variant="ghost" size="icon" aria-label={`Download ${file.name}`}>
              <Download className="h-4 w-4" />
            </Button>
            {!readOnly && (
              <Button variant="ghost" size="icon" aria-label={`Remove ${file.name}`}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveConfirm() {
  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove receipt-back.jpg?</AlertDialogTitle>
          <AlertDialogDescription>
            The file is removed from this transaction straight away. The transaction itself does not
            change, and the removal shows in its history.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction>Remove file</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export const states: ScreenStates = {
  'last-of-several': () => <Viewer index={2} />,
  pdf: () => <Viewer index={3} />,
  'read-only': () => <Viewer index={0} readOnly />,
  'remove-confirm': () => <RemoveConfirm />,
};

export default function AttachmentViewerScreen() {
  return <Viewer index={0} />;
}
