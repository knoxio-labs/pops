import { kitchen12Contents, kitchen12Workspace } from '@/fixtures/inventory/container-workspace';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EMPTY_SELECTION } from '../foundation';
import { ContentsList } from './contents-list';

import type { SelectionApi } from '../foundation';

const selection: SelectionApi = {
  state: EMPTY_SELECTION,
  count: 0,
  coverage: 'none',
  selectedIds: [],
  isSelected: () => false,
  onRowToggle: () => undefined,
  onHeaderToggle: () => undefined,
  clearSelection: () => undefined,
  onKey: () => false,
};

describe('ContentsList actions', () => {
  it('calls onEdit for the edited row', () => {
    const model = kitchen12Workspace('open');
    const id = kitchen12Contents(model)[0];
    if (id === undefined) throw new Error('Expected a container content row');
    const row = model.world.items.get(id);
    if (row === undefined) throw new Error('Expected the content row in the world');
    const onEdit = vi.fn();

    render(
      <ContentsList
        rows={[row]}
        model={model}
        selection={selection}
        query=""
        refusal={null}
        home="Garage"
        onClearQuery={() => undefined}
        onExit={() => undefined}
        onEdit={onEdit}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(onEdit).toHaveBeenCalledWith(id);
  });
});
