import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { showUndoToast } from '../../foundation/feedback/undo-toast.js';
import { connectionEndName, type ConnectionEnd } from './connection-model.js';

import type { WebConnectionRow } from '../../inventory-web/useConnectionsRegistry.js';
import type { ConnectionsPageModel } from './connections-page-model.js';

/** Event handlers and transient state owned by the Connections page. */
export interface ConnectionsPageActions {
  readonly disconnectingIds: ReadonlySet<string>;
  readonly selectedRows: WebConnectionRow[];
  readonly disconnectRows: (rows: readonly WebConnectionRow[]) => void;
  readonly onOpen: (end: ConnectionEnd) => void;
  readonly onTrace: (row: WebConnectionRow) => void;
  readonly onTraceSelection: () => void;
  readonly onLabels: () => void;
  readonly onCloseTrace: () => void;
  readonly onOpenTraceItem: (id: string) => void;
}

function rowDescription(row: WebConnectionRow): string {
  return `${row.item.name} to ${connectionEndName(row.far)}`;
}

function useDisconnectConnections(model: ConnectionsPageModel): {
  readonly disconnectingIds: ReadonlySet<string>;
  readonly disconnectRows: (rows: readonly WebConnectionRow[]) => void;
} {
  const [disconnectingIds, setDisconnectingIds] = useState<ReadonlySet<string>>(new Set());

  const runDisconnect = useCallback(
    async (rows: readonly WebConnectionRow[]): Promise<void> => {
      if (rows.length === 0 || !model.online) return;
      setDisconnectingIds((current) => new Set([...current, ...rows.map((row) => row.id)]));
      try {
        await Promise.all(rows.map((row) => model.mutations.disconnect(row)));
        model.selection.clearSelection();
        const firstRow = rows[0];
        showUndoToast({
          concept: 'connection',
          message:
            rows.length === 1 && firstRow !== undefined
              ? `Disconnected ${rowDescription(firstRow)}`
              : `Disconnected ${rows.length} connections`,
          onUndo: async () => {
            await Promise.all(
              rows.map((row) =>
                row.far.kind === 'fixture'
                  ? model.mutations.connectFixture(row.item.id, row.far.id)
                  : model.mutations.connectItems(row.item.id, row.far.id)
              )
            );
          },
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not disconnect connection');
      } finally {
        setDisconnectingIds((current) => {
          const next = new Set(current);
          for (const row of rows) next.delete(row.id);
          return next;
        });
      }
    },
    [model]
  );

  const disconnectRows = useCallback(
    (rows: readonly WebConnectionRow[]): void => {
      void runDisconnect(rows);
    },
    [runDisconnect]
  );

  return { disconnectingIds, disconnectRows };
}

/** Binds navigation, selection actions, and one-toast disconnect undo. */
export function useConnectionsPageActions(model: ConnectionsPageModel): ConnectionsPageActions {
  const navigate = useNavigate();
  const { disconnectingIds, disconnectRows } = useDisconnectConnections(model);
  const selectedRows = useMemo(
    () => model.registry.rows.filter((row) => model.selection.isSelected(row.id)),
    [model.registry.rows, model.selection]
  );

  const onOpen = useCallback(
    (end: ConnectionEnd): void => {
      void navigate(
        end.kind === 'item' ? `/inventory/items/${end.id}` : `/inventory/fixtures/${end.id}`
      );
    },
    [navigate]
  );
  const onTrace = useCallback(
    (row: WebConnectionRow): void => model.setTrace(row.item.id),
    [model]
  );
  const onTraceSelection = useCallback((): void => {
    const row = selectedRows[0];
    if (row !== undefined && selectedRows.length === 1) model.setTrace(row.item.id);
  }, [model, selectedRows]);
  const onLabels = useCallback((): void => {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const row of selectedRows) {
      if (seen.has(row.item.id)) continue;
      seen.add(row.item.id);
      ids.push(row.item.id);
    }
    if (ids.length > 0) void navigate(`/inventory/labels?ids=${ids.join(',')}`);
  }, [navigate, selectedRows]);
  const onCloseTrace = useCallback((): void => model.setTrace(null), [model]);
  const onOpenTraceItem = useCallback(
    (id: string): void => {
      void navigate(`/inventory/items/${id}`);
    },
    [navigate]
  );

  return {
    disconnectingIds,
    selectedRows,
    disconnectRows,
    onOpen,
    onTrace,
    onTraceSelection,
    onLabels,
    onCloseTrace,
    onOpenTraceItem,
  };
}
