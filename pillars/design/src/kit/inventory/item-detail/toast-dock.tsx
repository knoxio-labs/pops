/**
 * Where the page's undo toast sits: bottom right, over the content, the
 * same place sonner puts toasts in the app.
 */
import { UndoToast } from '../foundation';

import type { UndoOffer } from './use-undo-toast';

/** The docked toast, or nothing. */
export function ToastDock({ offer, onUndo }: { offer: UndoOffer | null; onUndo: () => void }) {
  if (offer === null) return null;
  return (
    <div className="pointer-events-none fixed right-6 bottom-6 z-50 flex flex-col items-end">
      <UndoToast
        concept={offer.concept}
        message={offer.message}
        state={offer.state}
        onUndo={onUndo}
        className="pointer-events-auto"
      />
    </div>
  );
}
