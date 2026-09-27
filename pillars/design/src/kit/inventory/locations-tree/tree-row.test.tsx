import { coreWorld } from '@/fixtures/inventory/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TreeRow } from './tree-row';
import { treeRows } from './tree-rows';

describe('TreeRow actions', () => {
  it('offers Rename as a quick action', () => {
    const row = treeRows(coreWorld, new Set())[0];
    if (row === undefined) throw new Error('Expected a location row');

    render(
      <TreeRow
        row={row}
        count={0}
        selected={false}
        menu={{}}
        onRename={vi.fn()}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onOpen={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: `Rename ${row.node.name}` })).toBeInTheDocument();
  });
});
