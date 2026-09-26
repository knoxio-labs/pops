import { ClipboardCopy, Download, SquarePen } from 'lucide-react';

import { INVENTORY_ICONS } from '../model';
import { ItemList, ItemRow } from '../rows/item-row';
import { coreItem, coreWorld } from '../test-fixtures/core';
import { SelectionBar } from './selection-bar';
import { useSelection } from './use-selection';

import type { Meta, StoryObj } from '@storybook/react-vite';

import type { SelectionBarAction } from '../model';
import type { SelectionState } from './use-selection';

const meta = {
  title: 'Inventory/Foundation/SelectionBar',
  component: SelectionBar,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function selectionActions(insideContainer: boolean): readonly SelectionBarAction[] {
  const icons = INVENTORY_ICONS;
  return [
    { id: 'pick-up', label: 'Pick up', icon: icons.pickUp, shortcutId: 'pick-up' },
    { id: 'move', label: 'Move', icon: icons.move, shortcutId: 'move' },
    {
      id: 'take-out',
      label: 'Take out',
      icon: icons.takeOut,
      shortcutId: 'take-out',
      disabledReason: insideContainer ? undefined : 'Only inside a container',
    },
    { id: 'label', label: 'Label', icon: icons.label, shortcutId: 'label' },
    { id: 'set-type', label: 'Set type', icon: icons.type },
    { id: 'set-field', label: 'Set field', icon: SquarePen },
    { id: 'retire', label: 'Retire', icon: icons.retired, overflow: true },
    { id: 'discard', label: 'Discard', icon: icons.discarded, overflow: true },
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
    <div className="mx-auto max-w-4xl space-y-2 rounded-xl border bg-muted/30 p-6">
      <ItemList
        label="Items"
        onKeyDown={(event) => {
          if (selection.onKey(event)) event.preventDefault();
        }}
      >
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
        actions={selectionActions(insideContainer)}
        carriedCount={carried}
        onSelectAll={selection.onHeaderToggle}
        onClear={selection.clearSelection}
      />
    </div>
  );
}

const ITEMS_PAGE = ['itm-tv', 'box-cables', 'itm-lamp', 'itm-drill', 'itm-printer'];
const IN_KITCHEN_12 = ['itm-plates', 'itm-mugs', 'itm-knife'];

/** Items page selection with a disabled container-only action and overflow verbs. */
export const OnItems: Story = {
  args: {
    count: 2,
    loadedCount: 5,
    coverage: 'some',
    carriedCount: 3,
    actions: selectionActions(false),
  },
  render: () => (
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
  ),
};

/** In-container selection with every loaded row selected and Take out available. */
export const InsideContainer: Story = {
  args: {
    count: 3,
    loadedCount: 3,
    coverage: 'all',
    actions: selectionActions(true),
  },
  render: () => (
    <SelectableList
      ids={IN_KITCHEN_12}
      initial={{
        selected: new Set(IN_KITCHEN_12),
        anchorId: 'itm-plates',
        focusedId: null,
      }}
      insideContainer
      carried={0}
    />
  ),
};
