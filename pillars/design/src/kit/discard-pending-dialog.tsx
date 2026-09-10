import { type PendingImport, sourceLabel } from '@/fixtures/pending-imports';

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

export interface DiscardCopy {
  title: string;
  body: string;
  action: string;
}

/**
 * What Discard promises, by what is actually at stake. A live import loses
 * nothing but decisions (the bank still has every row and resends them),
 * so the wording must not scare. A file draft loses the decisions AND the
 * way back, because the file is not stored; it has to say which file to
 * upload again. An unusable draft has already lost the decisions, so the
 * confirmation is only about the file.
 */
export function discardCopy(item: PendingImport): DiscardCopy {
  const label = sourceLabel(item.source);
  if (item.source.kind === 'live') {
    const rows = item.rowCount === 1 ? '1 transaction' : `${item.rowCount} transactions`;
    return {
      title: `Discard this ${item.source.provider} import?`,
      body: `The ${rows} are not deleted anywhere. ${item.source.provider} still has them, and the next sync fetches them again. Only the decisions you made here are lost.`,
      action: `Discard, ${item.source.provider} will resend`,
    };
  }
  const reupload = `The file itself is not stored: to import it later, upload ${label} again.`;
  if (item.state === 'unusable') {
    return {
      title: `Discard ${label}?`,
      body: `Nothing in this draft can be resumed. ${reupload}`,
      action: 'Discard',
    };
  }
  const decided = Math.max(0, item.rowCount - (item.unresolvedCount ?? 0));
  const decisions = decided === 1 ? '1 decision' : `${decided} decisions`;
  return {
    title: `Discard ${label}?`,
    body: `The ${decisions} you made in it are lost. ${reupload}`,
    action: 'Discard',
  };
}

export function DiscardPendingDialog({ item }: { item: PendingImport }) {
  const copy = discardCopy(item);
  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction variant="destructive">{copy.action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
