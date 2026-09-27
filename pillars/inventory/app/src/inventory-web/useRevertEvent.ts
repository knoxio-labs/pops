import { useQueryClient } from '@tanstack/react-query';

import { UndoRefusedError } from './item-verbs.js';
import { sendInventoryMutation } from './mutation-client.js';

import type { WebEvent } from './useWebEvents.js';

const WEB_QUERY_ROOT: readonly ['inventory', 'web'] = ['inventory', 'web'];

/** Sends one event revert and invalidates all inventory web queries regardless of its outcome. */
export function useRevertEvent(): (event: Pick<WebEvent, 'seq' | 'entityId'>) => Promise<void> {
  const queryClient = useQueryClient();
  return async (event: Pick<WebEvent, 'seq' | 'entityId'>): Promise<void> => {
    try {
      const outcome = await sendInventoryMutation({
        command: { op: 'event.revert', args: { seq: event.seq } },
        entityId: event.entityId,
      });
      if (outcome.status !== 'applied') {
        throw new UndoRefusedError({ kind: 'outcome', outcome });
      }
    } finally {
      void queryClient.invalidateQueries({ queryKey: WEB_QUERY_ROOT });
    }
  };
}
