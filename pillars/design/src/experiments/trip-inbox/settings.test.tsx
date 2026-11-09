import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InboxContext } from './context';
import { CreateInboxTarget } from './create';
import { createInboxState } from './fixture';
import { inboxSourceRow } from './model';

import type { InboxState } from './model';

describe('explicit new-item lifecycle', () => {
  it('shows configured defaults and saves the person’s changed selections without a purchase', () => {
    const state = createInboxState();
    state.creationDefaults = { intention: 'Alternative', arrangement: 'Not needed' };
    const row = inboxSourceRow(state, 'capture-recife-note');
    if (!row) throw new Error('Captured source missing');
    const change = vi.fn((next: InboxState) => next);
    render(
      <InboxContext value={{ state, change }}>
        <CreateInboxTarget row={row} />
      </InboxContext>
    );
    const stateBadges = screen.getByRole('group', { name: 'New item state' });
    expect(within(stateBadges).getByText('Alternative')).toBeInTheDocument();
    expect(within(stateBadges).getByText('Not needed')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Location, visit and settings'));
    fireEvent.click(screen.getByRole('combobox', { name: 'New item intent' }));
    fireEvent.click(screen.getByRole('option', { name: 'In plan' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'New item booking state' }));
    fireEvent.click(screen.getByRole('option', { name: 'Agreed' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'New item type' }));
    fireEvent.click(screen.getByRole('option', { name: 'Event' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'New item title' }), {
      target: { value: 'Breakfast with Clara' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create item' }));
    const call = change.mock.calls[0];
    if (!call) throw new Error('Creation did not change local state');
    const next = call[0];
    const created = next.targets.find((target) => target.title === 'Breakfast with Clara');
    if (!created) throw new Error('Created target missing');
    expect(created.intention).toBe('In plan');
    expect(created.arrangement).toBe('Agreed');
    expect(created.purchase).toBeUndefined();
    expect(next.capture).toBe(state.capture);
    expect(next.routeOrder).toBe(state.routeOrder);
  });
});
