/**
 * The selection bar over a list: on Items, where Take out has nothing to
 * take out of and says so, and inside a container, where it is the point
 * and the bar states what the selection carries.
 */
import { coreItem, coreWorld } from '@/fixtures/inventory/core';
import { ClipboardCopy, Download, SquarePen } from 'lucide-react';

import { INVENTORY_ICONS } from '../shared/icons';
import { ItemList, ItemRow } from '../shared/item-row';
import { SelectionBar } from '../shared/selection-bar';
import { useSelection } from '../shared/use-selection';
import { Specimen } from './gallery-frame';

import type { SelectionBarAction } from '../shared/contracts';
import type { SelectionState } from '../shared/use-selection';

const I = INVENTORY_ICONS;

function actions(insideContainer: boolean): SelectionBarAction[] {
  return [
    { id: 'pick-up', label: 'Pick up', icon: I.pickUp, shortcutId: 'pick-up' },
    { id: 'move', label: 'Move', icon: I.move, shortcutId: 'move' },
    {
      id: 'take-out',
      label: 'Take out',
      icon: I.takeOut,
      shortcutId: 'take-out',
      disabledReason: insideContainer ? undefined : 'Only inside a container',
    },
    { id: 'label', label: 'Label', icon: I.label, shortcutId: 'label' },
    { id: 'set-type', label: 'Set type', icon: I.type },
    { id: 'set-field', label: 'Set field', icon: SquarePen },
    { id: 'retire', label: 'Retire', icon: I.retired, overflow: true },
    { id: 'discard', label: 'Discard', icon: I.discarded, overflow: true },
    { id: 'export', label: 'Export selected as CSV', icon: Download, overflow: true },
    { id: 'copy-codes', label: 'Copy codes', icon: ClipboardCopy, overflow: true },
  ];
}

function SelectableList({
  ids,
  initial,
  insideContainer,
  carried,
}: {
  ids: readonly string[];
  initial: SelectionState;
  insideContainer: boolean;
  carried: number;
}) {
  const selection = useSelection(ids, initial);
  return (
    <div className="space-y-2">
      <ItemList label="Items">
        {ids.map((id) => (
          <ItemRow
            key={id}
            item={coreItem(id)}
            world={coreWorld}
            selectable
            selected={selection.isSelected(id)}
            focused={selection.state.focusedId === id}
            showPlacement={!insideContainer}
            onToggle={selection.onRowToggle}
          />
        ))}
      </ItemList>
      <SelectionBar
        count={selection.count}
        loadedCount={ids.length}
        coverage={selection.coverage}
        actions={actions(insideContainer)}
        carriedCount={carried}
        onSelectAll={selection.onHeaderToggle}
        onClear={selection.clearSelection}
      />
    </div>
  );
}

const ITEMS_PAGE = ['itm-tv', 'box-cables', 'itm-lamp', 'itm-drill', 'itm-printer'];
const IN_KITCHEN_12 = ['itm-plates', 'itm-mugs', 'itm-knife'];

/** Two bars: on Items with a container in the selection, and inside Kitchen 12. */
export function SelectionGallery() {
  return (
    <div className="space-y-5">
      <Specimen
        label="On Items"
        note="Take out waits for a container. Retire, Discard, Export and Copy codes sit in More."
      >
        <SelectableList
          ids={ITEMS_PAGE}
          initial={{
            selected: new Set(['box-cables', 'itm-lamp']),
            anchorId: 'itm-lamp',
            focusedId: 'itm-lamp',
          }}
          insideContainer={false}
          carried={3}
        />
      </Specimen>
      <Specimen label="Inside Kitchen 12" note="Every row selected; Take out is live.">
        <SelectableList
          ids={IN_KITCHEN_12}
          initial={{ selected: new Set(IN_KITCHEN_12), anchorId: 'itm-plates', focusedId: null }}
          insideContainer
          carried={0}
        />
      </Specimen>
    </div>
  );
}
