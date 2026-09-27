import { Cable } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { Button, Sheet } from '@pops/ui';

import { useItemRows } from '../../inventory-web/useWebItems.js';
import { wireItemRefusal, WireItemsContent } from './wire-items-source.js';

import type { ReactElement } from 'react';

import type { ItemRowModel } from '../../foundation/model/model.js';
import type { WireItemsSheetProps, WireItemsState } from './wire-items-types.js';

function useWireItemsState(props: WireItemsSheetProps): WireItemsState {
  const [queryDraft, setQueryDraft] = useState('');
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [wiring, setWiring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const itemRows = useItemRows({ includeInactive: true, q: queryDraft.trim(), sort: 'name' });
  const candidates = useMemo(
    () => itemRows.rows.filter((item) => item.container === null),
    [itemRows.rows]
  );
  const selected = useMemo(
    () => candidates.filter((item) => selectedIds.has(item.id)),
    [candidates, selectedIds]
  );
  const toggle = useCallback(
    (item: ItemRowModel): void => {
      if (wireItemRefusal(item, props.wiredIds) !== null) return;
      setSelectedIds((current) => {
        const next = new Set(current);
        if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
    },
    [props.wiredIds]
  );
  const wire = useCallback(async (): Promise<void> => {
    if (selected.length === 0 || !props.online || wiring) return;
    setWiring(true);
    setError(null);
    try {
      await props.onWire(selected.map((item) => item.id));
      props.onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The selected items were not wired.');
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
  const label = `Wire ${selectedCount > 0 ? selectedCount : ''} item${selectedCount === 1 ? '' : 's'}`;
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
      description="Choose active, unwired items. Containers and inactive records are refused."
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
