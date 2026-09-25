/**
 * Destroy is the one irreversible lifecycle act, so it is the one that asks
 * twice: an alert dialog that says it is final, with the only red button
 * on the page, naming what it destroys.
 */
import { useState } from 'react';

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

import { confirmLabel } from './lifecycle-model';
import { ReasonField } from './reason-field';

/** Props for {@link DestroyDialog}. */
export interface DestroyDialogProps {
  subject: string | number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm?: (reason: string | null) => void;
  /** Things inside a container come out first and stay where it was. */
  contentsCount?: number;
}

/** The destroy confirmation. */
export function DestroyDialog({
  subject,
  open,
  onOpenChange,
  onConfirm,
  contentsCount = 0,
}: DestroyDialogProps) {
  const [preset, setPreset] = useState<string | null>(null);
  const [text, setText] = useState('');
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmLabel('destroy', subject)}?</AlertDialogTitle>
          <AlertDialogDescription>
            This is final. It cannot be restored, moved or edited again. Its history stays and its
            code is freed for reuse.
            {contentsCount > 0
              ? ` The ${contentsCount} things inside come out first and stay where it was.`
              : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ReasonField
          act="destroy"
          preset={preset}
          text={text}
          onPreset={setPreset}
          onText={setText}
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => onConfirm?.(preset === 'Other' ? text.trim() : preset)}
          >
            {confirmLabel('destroy', subject)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
