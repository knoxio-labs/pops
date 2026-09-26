import { fireEvent, render, screen } from '@testing-library/react';
import { Archive } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { coreItem, coreWorld } from '../fixtures/core';
import { ItemList, ItemRow, RowVerb } from './item-row';

describe('ItemRow', () => {
  it('passes Shift from the selection checkbox to the row toggle', () => {
    const onToggle = vi.fn();
    const item = coreItem('itm-tv');

    render(<ItemRow item={item} world={coreWorld} selectable onToggle={onToggle} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Television' }), {
      shiftKey: true,
    });

    expect(onToggle).toHaveBeenCalledWith('itm-tv', true);
  });

  it('opens an item from its accessible name button', () => {
    const onOpen = vi.fn();
    const item = coreItem('itm-tv');

    render(<ItemRow item={item} world={coreWorld} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Television' }));

    expect(onOpen).toHaveBeenCalledWith('itm-tv');
  });

  it('renders the row badges and keeps placement optional', () => {
    const item = {
      ...coreItem('itm-tv'),
      code: 'TV1',
      quantity: 3,
      lifecycle: 'lost' as const,
      sync: 'stale' as const,
      container: { access: 'closed' as const, full: true },
    };

    const view = render(<ItemRow item={item} world={coreWorld} showPlacement={false} />);

    expect(screen.getByText('×3')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.getByText('Full')).toBeInTheDocument();
    expect(screen.getByText('Lost')).toBeInTheDocument();
    expect(screen.getByText('Changed elsewhere')).toBeInTheDocument();
    expect(screen.getByText('TV1')).toBeInTheDocument();
    expect(view.container.querySelector('[title="Wattle Street house › Living room"]')).toBeNull();
  });

  it('marks pending, focused and rejected rows without losing the alert', () => {
    render(
      <ItemRow
        item={coreItem('itm-tv')}
        world={coreWorld}
        selected
        focused
        pending
        rejection="The item changed elsewhere."
      />
    );

    const row = screen.getByRole('row');
    expect(row).toHaveAttribute('data-focused', 'true');
    expect(row).toHaveClass('border-l-app-accent', 'ring-2', 'bg-warning/10');
    expect(screen.getByRole('alert')).toHaveTextContent('Not saved. The item changed elsewhere.');
  });

  it('makes an ItemList a focusable keyboard grid only when a handler is supplied', () => {
    const onKeyDown = vi.fn();
    const view = render(
      <ItemList label="Items" onKeyDown={onKeyDown}>
        <div role="row">One</div>
      </ItemList>
    );

    const grid = screen.getByRole('grid', { name: 'Items' });
    expect(grid).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(grid, { key: 'j' });
    expect(onKeyDown).toHaveBeenCalledOnce();

    view.rerender(
      <ItemList label="Items">
        <div role="row">One</div>
      </ItemList>
    );
    expect(screen.getByRole('grid', { name: 'Items' })).not.toHaveAttribute('tabindex');
  });

  it('keeps disabled row verbs visible, explains why, and does not invoke them', () => {
    const onClick = vi.fn();

    render(
      <RowVerb
        icon={Archive}
        label="Archive"
        shortcutId="move"
        disabledReason="Unavailable while offline."
        onClick={onClick}
      />
    );

    const button = screen.getByRole('button', { name: 'Archive' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveClass('opacity-50');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
