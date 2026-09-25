/**
 * Retire, Mark lost and Discard: reversible acts, so no second question.
 * The dialog only collects the reason, names exactly what the act does to
 * lists, and its button carries the verb and the subject. Undo follows as a
 * toast.
 */
import { useState } from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pops/ui';

import { INVENTORY_ICONS } from '../foundation';
import { actCopy, confirmLabel, reasonReady } from './lifecycle-model';
import { ReasonField } from './reason-field';

/** The reversible acts this dialog handles. */
export type ReversibleAct = 'retire' | 'lost' | 'discard';

const OUTCOME: Readonly<Record<ReversibleAct, string>> = {
  retire: 'Kept on record but left out of lists and totals unless you include inactive items.',
  lost: 'Left out of lists until it turns up. Its last known place is kept.',
  discard: 'Left out of lists and totals. It keeps its history and can be restored.',
};

/** Props for {@link LifecycleDialog}. */
export interface LifecycleDialogProps {
  act: ReversibleAct;
  /** An item's name, or how many items a bulk act covers. */
  subject: string | number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm?: (reason: string | null) => void;
  initialPreset?: string | null;
  initialText?: string;
}

/** The reason dialog for a reversible lifecycle act. */
export function LifecycleDialog({
  act,
  subject,
  open,
  onOpenChange,
  onConfirm,
  initialPreset = null,
  initialText = '',
}: LifecycleDialogProps) {
  const [preset, setPreset] = useState<string | null>(initialPreset);
  const [text, setText] = useState(initialText);
  const copy = actCopy(act);
  const Icon = INVENTORY_ICONS[copy.concept];
  const ready = reasonReady(act, preset, text);
  const bulk = typeof subject === 'number';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="size-4 text-muted-foreground" aria-hidden />
            {confirmLabel(act, subject)}?
          </DialogTitle>
          <DialogDescription>
            {OUTCOME[act]} {bulk ? 'Each item records the same reason.' : null}
          </DialogDescription>
        </DialogHeader>
        <ReasonField act={act} preset={preset} text={text} onPreset={setPreset} onText={setText} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!ready}
            onClick={() => onConfirm?.(preset === 'Other' ? text.trim() : preset)}
          >
            {confirmLabel(act, subject)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
