import { toast } from 'sonner';

import { UndoToast, UNDO_RESULT_MS } from '../../foundation/feedback/undo-toast.js';
import { UndoRefusedError } from '../../inventory-web/item-verbs.js';

import type { EventModel } from '../../foundation/model/model.js';
import type { WebEvent } from '../../inventory-web/useWebEvents.js';

/** Shows the resolved or conflicted result of undoing one recent event. */
export async function undoEvent(
  event: { model: Pick<EventModel, 'id' | 'summary'>; source: WebEvent },
  revertEvent: (event: Pick<WebEvent, 'seq' | 'entityId'>) => Promise<void>,
  navigate: (path: string) => void | Promise<void>
): Promise<void> {
  try {
    await revertEvent({ seq: event.source.seq, entityId: event.source.entityId });
    toast.custom(() => <UndoToast concept="undo" message={event.model.summary} state="undone" />, {
      duration: UNDO_RESULT_MS,
    });
  } catch (error: unknown) {
    if (error instanceof UndoRefusedError) {
      let toastId: string | number = '';
      const onOpenHistory =
        event.source.entityKind === 'item'
          ? () => {
              toast.dismiss(toastId);
              void navigate(`/inventory/items/${event.source.entityId}/history`);
            }
          : undefined;
      toastId = toast.custom(
        () => (
          <UndoToast
            concept="undo"
            message={event.model.summary}
            state="conflict"
            onOpenHistory={onOpenHistory}
          />
        ),
        { duration: UNDO_RESULT_MS }
      );
      return;
    }
    toast.error('Could not undo. The inventory service did not answer.');
  }
}
