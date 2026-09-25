/**
 * The one toast every reversible act shows (spec 3.5): what happened, in
 * words, and Undo with its key for 8 seconds. Undo is a compensating event;
 * when it conflicts the same toast says so and points at the history.
 */
import { toast } from 'sonner';

import { Button, cn } from '@pops/ui';

import { INVENTORY_ICONS } from './icons';
import { ShortcutHint } from './kbd';

import type { InventoryConcept } from './icons';

/** Where an undo is: offered, done, or refused because the item changed since. */
export type UndoToastState = 'offered' | 'undone' | 'conflict';

/** Props for {@link UndoToast}. */
export interface UndoToastProps {
  concept: InventoryConcept;
  /** Literal past tense: "Moved 3 items to Garage". */
  message: string;
  state?: UndoToastState;
  onUndo?: () => void;
  onOpenHistory?: () => void;
  className?: string;
}

/** How long Undo stays on offer; Cmd-Z works only while it shows. */
export const UNDO_WINDOW_MS = 8000;

function Body({ concept, message, state }: Pick<UndoToastProps, 'concept' | 'message' | 'state'>) {
  const Icon = state === 'conflict' ? INVENTORY_ICONS.needsAttention : INVENTORY_ICONS[concept];
  return (
    <span className="flex min-w-0 flex-1 items-start gap-2.5">
      <Icon
        className={cn(
          'mt-0.5 size-4 shrink-0',
          state === 'conflict' ? 'text-warning' : 'text-muted-foreground'
        )}
        aria-hidden
      />
      <span className="min-w-0 text-sm">
        <span className="block">{state === 'undone' ? `Undone: ${message}` : message}</span>
        {state === 'conflict' ? (
          <span className="block text-xs text-muted-foreground">
            Could not undo: it changed since.
          </span>
        ) : null}
      </span>
    </span>
  );
}

/** The toast body, also rendered inline by the foundation gallery. */
export function UndoToast({
  concept,
  message,
  state = 'offered',
  onUndo,
  onOpenHistory,
  className,
}: UndoToastProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex w-96 max-w-full items-center gap-3 rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-lg',
        className
      )}
    >
      <Body concept={concept} message={message} state={state} />
      {state === 'offered' ? (
        <Button size="sm" variant="outline" onClick={onUndo} suffix={<ShortcutHint id="undo" />}>
          Undo
        </Button>
      ) : null}
      {state === 'conflict' ? (
        <Button size="sm" variant="outline" onClick={onOpenHistory}>
          Open history
        </Button>
      ) : null}
    </div>
  );
}

/** Shows an undo toast through sonner for {@link UNDO_WINDOW_MS}. */
export function showUndoToast(props: Omit<UndoToastProps, 'state' | 'className'>): string | number {
  return toast.custom(
    (id) => (
      <UndoToast
        {...props}
        onUndo={() => {
          toast.dismiss(id);
          props.onUndo?.();
        }}
      />
    ),
    { duration: UNDO_WINDOW_MS }
  );
}
