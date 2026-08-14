import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { NodeRow } from './NodeRow';

import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';

import type { LocationTreeNode } from '../../utils';

const node: LocationTreeNode = {
  id: 'loc-1',
  name: 'Garage',
  parentId: null,
  sortOrder: 0,
  children: [],
};

/** The exact shape `useSortable` hands back — every key must survive the spread. */
const attributes: DraggableAttributes = {
  role: 'button',
  tabIndex: 0,
  'aria-disabled': false,
  'aria-pressed': undefined,
  'aria-roledescription': 'sortable',
  'aria-describedby': 'DndDescribedBy-0',
};

function renderRow(
  listeners: DraggableSyntheticListeners,
  onSelect: (id: string) => void = vi.fn()
) {
  return render(
    <MemoryRouter>
      <NodeRow
        node={node}
        depth={0}
        open={false}
        hasChildren={false}
        isSelected={false}
        isOver={false}
        isDragging={false}
        renaming={false}
        setRenaming={vi.fn()}
        siblingIndex={0}
        siblingCount={1}
        attributes={attributes}
        listeners={listeners}
        setActivatorNodeRef={vi.fn()}
        onSelect={onSelect}
        onAddChild={vi.fn()}
        onRename={vi.fn()}
        onMoveStart={vi.fn()}
        onReorder={vi.fn()}
        onDelete={vi.fn()}
      />
    </MemoryRouter>
  );
}

describe('NodeRow drag handle', () => {
  it('forwards every dnd-kit draggable attribute onto the handle', () => {
    renderRow({});
    const handle = screen.getByRole('button', { name: 'Drag Garage' });
    expect(handle).toHaveAttribute('aria-roledescription', 'sortable');
    expect(handle).toHaveAttribute('aria-describedby', 'DndDescribedBy-0');
    expect(handle).toHaveAttribute('aria-disabled', 'false');
    expect(handle).toHaveAttribute('tabindex', '0');
  });

  it('forwards dnd-kit listeners so the handle can start a drag', () => {
    const onPointerDown = vi.fn();
    const onKeyDown = vi.fn();
    renderRow({ onPointerDown, onKeyDown });
    const handle = screen.getByRole('button', { name: 'Drag Garage' });
    fireEvent.pointerDown(handle);
    fireEvent.keyDown(handle, { key: ' ' });
    expect(onPointerDown).toHaveBeenCalledTimes(1);
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  it('renders a usable handle when dnd-kit supplies no listeners', () => {
    renderRow(undefined);
    expect(screen.getByRole('button', { name: 'Drag Garage' })).toBeInTheDocument();
  });

  it('keeps a click on the handle from selecting the row', () => {
    const onSelect = vi.fn();
    renderRow({}, onSelect);
    fireEvent.click(screen.getByRole('button', { name: 'Drag Garage' }));
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('treeitem'));
    expect(onSelect).toHaveBeenCalledWith('loc-1');
  });
});
