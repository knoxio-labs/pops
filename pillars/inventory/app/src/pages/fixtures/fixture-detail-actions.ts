import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { showUndoToast } from '../../foundation/feedback/undo-toast.js';
import { InventoryApiError } from '../../inventory-api-helpers.js';

import type { Dispatch, SetStateAction } from 'react';

import type { SelectionApi } from '../../foundation/selection/use-selection.js';
import type { FixtureDraft } from './fixture-form-dialog.js';
import type { FixtureDetail } from './fixture-model.js';
import type { useFixtureDetailPageModel } from './fixtures-page-model.js';

type FixtureDetailModel = ReturnType<typeof useFixtureDetailPageModel>;

/** One captured item identity used for ordered fixture wiring. */
export interface WireItem {
  readonly id: string;
  readonly name: string;
}

interface FixtureDetailActionsInput {
  readonly model: FixtureDetailModel;
  readonly fixture: FixtureDetail | undefined;
  readonly selection: SelectionApi;
}

/** Provides guarded fixture save, wire, disconnect, and undo actions. */
export function useFixtureDetailActions({ model, fixture, selection }: FixtureDetailActionsInput) {
  const [disconnectingIds, setDisconnectingIds] = useState<ReadonlySet<string>>(new Set());
  const save = useCallback(
    (draft: FixtureDraft): Promise<FixtureDetail> => {
      if (fixture === undefined) return Promise.reject(new Error('Fixture is not loaded.'));
      return model.mutations.save({ id: fixture.id, draft });
    },
    [fixture, model.mutations]
  );
  const wire = useCallback(
    async (items: readonly WireItem[]): Promise<void> => {
      if (!model.online || fixture === undefined) return;
      for (const item of items) {
        try {
          await model.connectionMutations.connectFixture(item.id, fixture.id);
        } catch (cause) {
          if (cause instanceof InventoryApiError && cause.status === 409) {
            toast.error(`${item.name} is already wired to ${fixture.name}.`);
          } else {
            toast.error(cause instanceof Error ? cause.message : 'Could not wire the item.');
          }
          throw cause;
        }
      }
    },
    [fixture, model.connectionMutations, model.online]
  );
  const disconnect = useCallback(
    (itemIds: readonly string[]): void => {
      if (!model.online || fixture === undefined || itemIds.length === 0) return;
      void disconnectItems({
        fixture,
        itemIds,
        model,
        selection,
        setDisconnectingIds,
      });
    },
    [fixture, model, selection]
  );
  return { disconnectingIds, save, wire, disconnect };
}

async function disconnectItems({
  fixture,
  itemIds,
  model,
  selection,
  setDisconnectingIds,
}: {
  readonly fixture: FixtureDetail;
  readonly itemIds: readonly string[];
  readonly model: FixtureDetailModel;
  readonly selection: SelectionApi;
  readonly setDisconnectingIds: Dispatch<SetStateAction<ReadonlySet<string>>>;
}): Promise<void> {
  const names = itemIds
    .map((itemId) => model.items.items.find((item) => item.id === itemId)?.name)
    .filter((name): name is string => name !== undefined);
  setDisconnectingIds((current) => new Set([...current, ...itemIds]));
  try {
    for (const itemId of itemIds) {
      try {
        await model.connectionMutations.disconnectFixture(itemId, fixture.id);
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : 'Could not disconnect the item.');
        return;
      }
    }
    selection.clearSelection();
    showUndoToast({
      concept: 'connection',
      message:
        names.length === 1
          ? `Disconnected ${names[0]} from ${fixture.name}`
          : `Disconnected ${names.length} items from ${fixture.name}`,
      onUndo: async () => {
        for (const itemId of itemIds) {
          await model.connectionMutations.connectFixture(itemId, fixture.id);
        }
      },
    });
  } finally {
    setDisconnectingIds((current) => {
      const next = new Set(current);
      for (const itemId of itemIds) next.delete(itemId);
      return next;
    });
  }
}
