import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { showUndoToast } from '../../foundation/feedback/undo-toast.js';
import { labelsHref } from '../labels-page/label-params.js';
import { connectionEndName, type ConnectionEnd, type ConnectionRow } from './connection-model.js';

import type { ConnectionsPageModel } from './connections-page-model.js';

/** Event handlers and transient state owned by the Connections page. */
export interface ConnectionsPageActions {
  readonly disconnectingIds: ReadonlySet<string>;
  readonly selectedRows: ConnectionRow[];
  readonly disconnectRows: (rows: readonly ConnectionRow[]) => void;
  readonly onOpen: (end: ConnectionEnd) => void;
  readonly onTrace: (row: ConnectionRow) => void;
  readonly onTraceSelection: () => void;
  readonly onLabels: () => void;
  readonly onCloseTrace: () => void;
  readonly onOpenTraceItem: (id: string) => void;
}

function rowDescription(row: ConnectionRow): string {
  return `${row.item.name} from ${connectionEndName(row.far)}`;
}

function useDisconnectConnections(model: ConnectionsPageModel): {
  readonly disconnectingIds: ReadonlySet<string>;
  readonly disconnectRows: (rows: readonly ConnectionRow[]) => void;
} {
  const [disconnectingIds, setDisconnectingIds] = useState<ReadonlySet<string>>(new Set());

  const runDisconnect = useCallback(
    async (rows: readonly ConnectionRow[]): Promise<void> => {
      if (rows.length === 0 || !model.online) return;
      setDisconnectingIds((current) => new Set([...current, ...rows.map((row) => row.id)]));
      try {
        for (const row of rows) await model.mutations.disconnect(row.source);
        model.selection.clearSelection();
        const firstRow = rows[0];
        showUndoToast({
          concept: 'connection',
          message:
            rows.length === 1 && firstRow !== undefined
              ? `Disconnected ${rowDescription(firstRow)}`
              : `Disconnected ${rows.length} connections`,
          onUndo: async () => {
            for (const row of rows) {
              if (row.far.kind === 'fixture') {
                await model.mutations.connectFixture(row.item.id, row.far.fixture.id);
              } else {
                await model.mutations.connectItems(row.item.id, row.far.item.id);
              }
            }
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
    (rows: readonly ConnectionRow[]): void => {
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
    () => model.resolvedRows.filter((row) => model.selection.isSelected(row.id)),
    [model.resolvedRows, model.selection]
  );

  const onOpen = useCallback(
    (end: ConnectionEnd): void => {
      void navigate(
        end.kind === 'item'
          ? `/inventory/items/${end.item.id}`
          : `/inventory/fixtures/${end.fixture.id}`
      );
    },
    [navigate]
  );
  const onTrace = useCallback((row: ConnectionRow): void => model.setTrace(row.item.id), [model]);
  const onTraceSelection = useCallback((): void => {
    const row = selectedRows[0];
    if (row !== undefined && selectedRows.length === 1) model.setTrace(row.item.id);
  }, [model, selectedRows]);
  const onLabels = useCallback((): void => {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const row of selectedRows) {
      const rowIds = [row.item.id, ...(row.far.kind === 'item' ? [row.far.item.id] : [])];
      for (const id of rowIds) {
        if (seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
      }
    }
    if (ids.length > 0) void navigate(labelsHref(ids));
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
