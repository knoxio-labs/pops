import { toast } from 'sonner';

import { Button, cn } from '@pops/ui';

import { INVENTORY_ICONS } from '../model/icons';
import { ShortcutHint } from '../shortcuts/shortcut-hint';

import type { ReactElement } from 'react';

import type { InventoryConcept } from '../model/icons';

/** The state of an inventory undo offer. */
export type UndoToastState = 'offered' | 'undone' | 'conflict';

/** The data the shortcut dispatcher needs from the active undo toast. */
export interface UndoOffer {
  concept: InventoryConcept;
  message: string;
  state: UndoToastState;
}

/** Props for {@link UndoToast}. */
export interface UndoToastProps {
  concept: InventoryConcept;
  message: string;
  state?: UndoToastState;
  onUndo?: () => void;
  onOpenHistory?: () => void;
  className?: string;
}

/** How long a reversible action remains available to Undo. */
export const UNDO_WINDOW_MS = 8000;

/** How long an undone or conflicting action remains visible. */
export const UNDO_RESULT_MS = 3000;

/** Options for showing a reversible inventory action. */
export interface ShowUndoToastOptions {
  concept: InventoryConcept;
  /** Literal past-tense copy such as "Moved 3 items to Garage". */
  message: string;
  /** Sends the compensating event and rejects when the action conflicts. */
  onUndo: () => Promise<void>;
  onOpenHistory?: () => void;
}

interface ActiveUndoOffer extends UndoOffer {
  readonly id: string;
  readonly onUndo: () => Promise<void>;
  readonly onOpenHistory?: () => void;
  pending: boolean;
}

let activeOffer: ActiveUndoOffer | null = null;
let nextToastId = 0;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;

function clearExpiryTimer(): void {
  if (expiryTimer !== null) clearTimeout(expiryTimer);
  expiryTimer = null;
}

function clearOffer(offer: ActiveUndoOffer): void {
  if (activeOffer !== offer) return;
  activeOffer = null;
  clearExpiryTimer();
}

function dismissOffer(offer: ActiveUndoOffer): void {
  if (activeOffer !== offer) return;
  clearOffer(offer);
  toast.dismiss(offer.id);
}

function scheduleExpiry(offer: ActiveUndoOffer, duration: number): void {
  clearExpiryTimer();
  expiryTimer = setTimeout(() => clearOffer(offer), duration);
}

function renderOffer(offer: ActiveUndoOffer, duration: number): void {
  toast.custom(
    () => (
      <UndoToast
        concept={offer.concept}
        message={offer.message}
        state={offer.state}
        onUndo={offer.state === 'offered' ? runActiveUndo : undefined}
        onOpenHistory={
          offer.state === 'conflict'
            ? () => {
                dismissOffer(offer);
                offer.onOpenHistory?.();
              }
            : undefined
        }
      />
    ),
    {
      id: offer.id,
      duration,
      onDismiss: () => clearOffer(offer),
      onAutoClose: () => clearOffer(offer),
    }
  );
}

async function resolveUndo(offer: ActiveUndoOffer): Promise<void> {
  try {
    await offer.onUndo();
    if (activeOffer !== offer) return;
    offer.state = 'undone';
  } catch {
    if (activeOffer !== offer) return;
    offer.state = 'conflict';
  }
  renderOffer(offer, UNDO_RESULT_MS);
  scheduleExpiry(offer, UNDO_RESULT_MS);
}

/** Returns the current offer for the inventory shortcut dispatcher. */
export function getActiveUndoOffer(): UndoOffer | null {
  if (activeOffer === null) return null;
  const { concept, message, state } = activeOffer;
  return { concept, message, state };
}

/** Starts the active offer's compensating action, at most once. */
export function runActiveUndo(): void {
  const offer = activeOffer;
  if (offer === null || offer.state !== 'offered' || offer.pending) return;
  offer.pending = true;
  clearExpiryTimer();
  void resolveUndo(offer);
}

function Body({ concept, message, state }: UndoOffer): ReactElement {
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

/** Renders the shared inventory undo toast in any of its three states. */
export function UndoToast({
  concept,
  message,
  state = 'offered',
  onUndo,
  onOpenHistory,
  className,
}: UndoToastProps): ReactElement {
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

/** Shows one active inventory undo offer through Sonner. */
export function showUndoToast(options: ShowUndoToastOptions): string | number {
  if (activeOffer !== null) dismissOffer(activeOffer);

  const offer: ActiveUndoOffer = {
    id: `inventory-undo-${++nextToastId}`,
    concept: options.concept,
    message: options.message,
    state: 'offered',
    onUndo: options.onUndo,
    onOpenHistory: options.onOpenHistory,
    pending: false,
  };
  activeOffer = offer;
  renderOffer(offer, UNDO_WINDOW_MS);
  scheduleExpiry(offer, UNDO_WINDOW_MS);
  return offer.id;
}
