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

import type { ReactElement } from 'react';

/** Props for {@link DocumentUnlinkDialog}. */
export interface DocumentUnlinkDialogProps {
  title: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

/** Confirms unlinking a document; the document itself stays in Paperless. Mount it only while open. */
export function DocumentUnlinkDialog({
  title,
  onOpenChange,
  onConfirm,
}: DocumentUnlinkDialogProps): ReactElement {
  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unlink {title}?</AlertDialogTitle>
          <AlertDialogDescription>
            It stops showing on this item. The document stays in Paperless.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={onConfirm}
          >
            Unlink
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
