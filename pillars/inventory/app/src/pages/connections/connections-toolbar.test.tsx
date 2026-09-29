import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConnectionsToolbar } from './connections-toolbar.js';

describe('ConnectionsToolbar', () => {
  it('shows the exact filtered summary only when both counts are available', () => {
    const view = render(
      <ConnectionsToolbar
        query="outlet"
        kind="fixture"
        view="list"
        summary={{ connections: 2, items: 2, fixtures: 2 }}
        total={7}
        narrowed
        onQueryChange={vi.fn()}
        onKindChange={vi.fn()}
        onViewChange={vi.fn()}
      />
    );

    expect(screen.getByText('2 of 7 shown: 2 items, 2 fixtures')).toBeInTheDocument();

    view.rerender(
      <ConnectionsToolbar
        query="outlet"
        kind="fixture"
        view="list"
        summary={null}
        total={7}
        narrowed
        onQueryChange={vi.fn()}
        onKindChange={vi.fn()}
        onViewChange={vi.fn()}
      />
    );
    expect(screen.queryByText(/shown:/)).not.toBeInTheDocument();
  });

  it('keeps q text in the field and emits kind tab changes', () => {
    const onQueryChange = vi.fn();
    const onKindChange = vi.fn();
    render(
      <ConnectionsToolbar
        query=" trailing "
        kind="all"
        view="list"
        summary={null}
        total={null}
        narrowed={false}
        onQueryChange={onQueryChange}
        onKindChange={onKindChange}
        onViewChange={vi.fn()}
      />
    );

    expect(screen.getByRole('textbox', { name: 'Filter connections' })).toHaveValue(' trailing ');
    fireEvent.change(screen.getByRole('textbox', { name: 'Filter connections' }), {
      target: { value: '  router  ' },
    });
    expect(onQueryChange).toHaveBeenCalledWith('  router  ');

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'To fixtures' }));
    expect(onKindChange).toHaveBeenCalledWith('fixture');
  });
});
