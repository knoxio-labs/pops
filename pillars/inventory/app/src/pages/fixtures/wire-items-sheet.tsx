import { Cable } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { Button, Sheet, useDebouncedValue } from '@pops/ui';

import { InventoryApiError } from '../../inventory-api-helpers.js';
import { useItemRows } from '../../inventory-web/useWebItems.js';
import { wireItemRefusal, WireItemsContent } from './wire-items-source.js';

import type { ReactElement } from 'react';

import type { ItemRowModel } from '../../foundation/model/model.js';
import type { WireItemsSheetProps, WireItemsState } from './wire-items-types.js';

function useWireItemsState(props: WireItemsSheetProps): WireItemsState {
  const [queryDraft, setQueryDraft] = useState('');
  const [selected, setSelected] = useState<readonly { id: string; name: string }[]>([]);
  const [wiring, setWiring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debouncedQuery = useDebouncedValue(queryDraft, 200).trim();
  const query = useMemo(
    () => ({
      ...(debouncedQuery.length > 0 ? { q: debouncedQuery } : {}),
      isContainer: 'false' as const,
      includeInactive: true,
      sort: 'name' as const,
    }),
    [debouncedQuery]
  );
  const itemRows = useItemRows(query, 50);
  const candidates = itemRows.rows;
  const selectedIds = useMemo(() => new Set(selected.map((item) => item.id)), [selected]);
  const toggle = useCallback(
    (item: ItemRowModel): void => {
      if (wireItemRefusal(item, props.wiredIds) !== null) return;
      setSelected((current) => {
        const index = current.findIndex((picked) => picked.id === item.id);
        if (index >= 0) return current.filter((picked) => picked.id !== item.id);
        return [...current, { id: item.id, name: item.name }];
      });
    },
    [props.wiredIds]
  );
  const wire = useCallback(async (): Promise<void> => {
    if (selected.length === 0 || !props.online || wiring) return;
    setWiring(true);
    setError(null);
    try {
      await props.onWire(selected);
      props.onOpenChange(false);
    } catch (cause) {
      if (!(cause instanceof InventoryApiError && cause.status === 409)) {
        setError(cause instanceof Error ? cause.message : 'The selected items were not wired.');
      }
    } finally {
      setWiring(false);
    }
  }, [props, selected, wiring]);
  return {
    itemRows,
    fixture: props.fixture,
    wiredIds: props.wiredIds,
    online: props.online,
    queryDraft,
    selectedIds,
    candidates,
    selected,
    wiring,
    error,
    setQueryDraft,
    toggle,
    wire,
  };
}

function WireItemsFooter({
  online,
  selectedCount,
  wiring,
  onCancel,
  onWire,
}: {
  readonly online: boolean;
  readonly selectedCount: number;
  readonly wiring: boolean;
  readonly onCancel: () => void;
  readonly onWire: () => void;
}): ReactElement {
  const label =
    selectedCount === 0
      ? 'Wire items'
      : `Wire ${selectedCount} item${selectedCount === 1 ? '' : 's'}`;
  return (
    <>
      <Button variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button
        disabled={!online || selectedCount === 0 || wiring}
        loading={wiring}
        onClick={onWire}
        prefix={<Cable className="size-4" aria-hidden />}
      >
        {label}
      </Button>
    </>
  );
}

function WireItemsSheetPanel({ props }: { readonly props: WireItemsSheetProps }): ReactElement {
  const state = useWireItemsState(props);
  return (
    <Sheet
      open
      onOpenChange={props.onOpenChange}
      title={`Wire items to ${props.fixture.name}`}
      description="Choose what plugs into or hangs from this fixture."
      footer={
        <WireItemsFooter
          online={props.online}
          selectedCount={state.selected.length}
          wiring={state.wiring}
          onCancel={() => props.onOpenChange(false)}
          onWire={() => void state.wire()}
        />
      }
    >
      <WireItemsContent state={state} />
    </Sheet>
  );
}

/** Renders the searchable item picker and refuses unsafe or duplicate wiring. */
export function WireItemsSheet(props: WireItemsSheetProps): ReactElement | null {
  if (!props.open) return null;
  return <WireItemsSheetPanel key={props.fixture.id} props={props} />;
}
