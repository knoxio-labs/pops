import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { showUndoToast } from '../../foundation/feedback/undo-toast.js';

import type { Dispatch, SetStateAction } from 'react';

import type { SelectionApi } from '../../foundation/selection/use-selection.js';
import type { FixtureDetail } from './fixture-model.js';
import type { FixtureDraft } from './fixtures-page-model.js';
import type { useFixtureDetailPageModel } from './fixtures-page-model.js';

type FixtureDetailModel = ReturnType<typeof useFixtureDetailPageModel>;

interface FixtureDetailActionsInput {
  readonly model: FixtureDetailModel;
  readonly fixture: FixtureDetail | undefined;
  readonly selection: SelectionApi;
}

/** Provides guarded fixture save, wire, disconnect, and undo actions for the detail page. */
export function useFixtureDetailActions({ model, fixture, selection }: FixtureDetailActionsInput) {
  const [disconnectingIds, setDisconnectingIds] = useState<ReadonlySet<string>>(new Set());
  const save = useCallback(
    async (draft: FixtureDraft): Promise<void> => {
      if (fixture === undefined) return;
      await model.mutations.save({ id: fixture.id, draft });
    },
    [fixture, model.mutations]
  );
  const wire = useCallback(
    async (itemIds: readonly string[]): Promise<void> => {
      if (!model.online || fixture === undefined) return;
      await Promise.all(
        itemIds.map((itemId) => model.connectionMutations.connectFixture(itemId, fixture.id))
      );
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
  setDisconnectingIds((current) => new Set([...current, ...itemIds]));
  try {
    await Promise.all(
      itemIds.map((itemId) => model.connectionMutations.disconnectFixture(itemId, fixture.id))
    );
    selection.clearSelection();
    const names = itemIds
      .map((itemId) => model.items.items.find((item) => item.id === itemId)?.name)
      .filter((name): name is string => name !== undefined);
    showUndoToast({
      concept: 'connection',
      message:
        names.length === 1
          ? `Disconnected ${names[0]} from ${fixture.name}`
          : `Disconnected ${names.length} items from ${fixture.name}`,
      onUndo: async () => {
        await Promise.all(
          itemIds.map((itemId) => model.connectionMutations.connectFixture(itemId, fixture.id))
        );
      },
    });
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : 'Could not disconnect the items.');
  } finally {
    setDisconnectingIds((current) => {
      const next = new Set(current);
      for (const itemId of itemIds) next.delete(itemId);
      return next;
    });
  }
}
