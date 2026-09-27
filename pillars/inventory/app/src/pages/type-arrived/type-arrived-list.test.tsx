import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model.js';
import { TypeArrivedList } from './type-arrived-list.js';

import type { ItemRowModel } from '../../foundation/model/model.js';
import type { UntypedItem } from './type-arrived-model.js';

const location = { id: 'room', name: 'Room', parentId: null, kind: 'room' as const };

function item(id: string, name: string): ItemRowModel {
  return {
    id,
    name,
    typeId: null,
    typeName: null,
    code: null,
    quantity: 1,
    container: null,
    lifecycle: 'active',
    placement: { kind: 'location', locationId: location.id },
    previous: null,
    sync: 'synced',
    photoUrl: null,
    note: null,
    updatedAt: '2026-01-01',
  };
}

const matches: UntypedItem[] = [
  { item: item('item-1', 'Shears'), legacyLabel: 'Garden' },
  { item: item('item-2', 'Hose'), legacyLabel: 'Workshop' },
];

describe('TypeArrivedList', () => {
  it('shows filed labels and toggles individual and all rows', () => {
    const onToggle = vi.fn();
    const onToggleAll = vi.fn();
    render(
      <TypeArrivedList
        matches={matches}
        world={buildWorld(
          matches.map(({ item: row }) => row),
          [location]
        )}
        ticked={new Set(['item-1', 'item-2'])}
        onToggle={onToggle}
        onToggleAll={onToggleAll}
      />
    );

    expect(screen.getByText('Garden')).toBeInTheDocument();
    expect(screen.getByText('Workshop')).toBeInTheDocument();
    expect(screen.getAllByText('Room')).toHaveLength(2);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Type Shears as this type' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Untick all' }));
    expect(onToggle).toHaveBeenCalledWith('item-1');
    expect(onToggleAll).toHaveBeenCalledOnce();
  });

  it('shows the applied type only for rows accepted by the bulk result', () => {
    render(
      <TypeArrivedList
        matches={matches}
        world={buildWorld(
          matches.map(({ item: row }) => row),
          [location]
        )}
        ticked={new Set(['item-1'])}
        appliedIds={new Set(['item-1'])}
        appliedType="Garden tools"
        onToggle={vi.fn()}
        onToggleAll={vi.fn()}
      />
    );

    expect(screen.getByText('Garden tools')).toBeInTheDocument();
    expect(screen.getByText('Workshop')).toBeInTheDocument();
    expect(screen.queryByText('Garden')).not.toBeInTheDocument();
  });
});
