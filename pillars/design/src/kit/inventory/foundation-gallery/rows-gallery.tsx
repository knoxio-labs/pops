/**
 * Rows: the one item row in each of its states (plain, grouped, open and
 * closed containers, deep in boxes, in hand, sync trouble, lifecycle, long
 * name, selected, focused, saving, refused), then the same items as a table.
 */
import {
  blender,
  coreWorld,
  drill,
  hdmiCables,
  kitchen12,
  kitchen13,
  longNamed,
  router,
  speaker,
  tapeMeasure,
  television,
  usbcCables,
} from '@/fixtures/inventory/core';
import { MoreHorizontal } from 'lucide-react';
import { useMemo } from 'react';

import { DataTable } from '@pops/ui';

import { INVENTORY_ICONS } from '../shared/icons';
import { ItemList, ItemRow, RowVerb } from '../shared/item-row';
import { itemTableColumns } from '../shared/item-table-columns';
import { useSelection } from '../shared/use-selection';
import { Specimen } from './gallery-frame';

import type { ItemRowModel } from '../shared/model';

const ROWS: readonly ItemRowModel[] = [
  television,
  hdmiCables,
  kitchen13,
  kitchen12,
  usbcCables,
  tapeMeasure,
  router,
  blender,
  speaker,
  longNamed,
  drill,
];
const ORDER = ROWS.map((row) => row.id);
const INITIAL = {
  selected: new Set(['itm-hdmi', 'box-k13']),
  anchorId: 'box-k13',
  focusedId: 'itm-tv',
};

function Verbs() {
  return (
    <>
      <RowVerb icon={INVENTORY_ICONS.pickUp} label="Pick up" shortcutId="pick-up" />
      <RowVerb icon={INVENTORY_ICONS.move} label="Move" shortcutId="move" />
      <RowVerb icon={MoreHorizontal} label="More" shortcutId="row-menu" />
    </>
  );
}

/** Every row state in one list, driven by the real selection model. */
export function RowsGallery() {
  const selection = useSelection(ORDER, INITIAL);
  return (
    <Specimen
      label="Item rows"
      note="Focus ring is the keyboard row. Accent edge: saving. Tint: selected."
    >
      <ItemList
        label="Items, j and k move, x selects"
        onKeyDown={(event) => {
          if (selection.onKey(event)) event.preventDefault();
        }}
      >
        {ROWS.map((row) => (
          <ItemRow
            key={row.id}
            item={row}
            world={coreWorld}
            selectable
            selected={selection.isSelected(row.id)}
            focused={selection.state.focusedId === row.id}
            pending={row.id === tapeMeasure.id}
            rejection={
              row.id === drill.id
                ? 'Office 04 is closed, so Cordless drill stayed on Workbench.'
                : null
            }
            onToggle={selection.onRowToggle}
            verbs={<Verbs />}
          />
        ))}
      </ItemList>
    </Specimen>
  );
}

/** The same shape as a table, with the selection column and tablet-hidden columns. */
export function TableGallery() {
  const selection = useSelection(ORDER, INITIAL);
  const columns = useMemo(
    () => itemTableColumns({ world: coreWorld, selection, hidden: ['updated'] }),
    [selection]
  );
  return (
    <Specimen
      label="Item table"
      note="Same row model through DataTable, Updated column hidden as at tablet width."
    >
      <DataTable columns={columns} data={ROWS.slice(0, 8)} paginated={false} />
    </Specimen>
  );
}
