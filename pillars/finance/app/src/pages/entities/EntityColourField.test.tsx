import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EntityColourField } from './EntityColourField';

describe('EntityColourField', () => {
  it('shows "None assigned" for a legacy entity with no colour', () => {
    render(<EntityColourField colour={null} onReroll={vi.fn()} isPending={false} />);
    expect(screen.getByText('None assigned')).toBeInTheDocument();
  });

  it('shows the assigned colour value', () => {
    render(<EntityColourField colour="#e04667" onReroll={vi.fn()} isPending={false} />);
    expect(screen.getByText('#e04667')).toBeInTheDocument();
    expect(screen.queryByText('None assigned')).toBeNull();
  });

  it('calls onReroll when Shuffle is clicked', async () => {
    const onReroll = vi.fn();
    const user = userEvent.setup();
    render(<EntityColourField colour="#e04667" onReroll={onReroll} isPending={false} />);

    await user.click(screen.getByRole('button', { name: /shuffle/i }));

    expect(onReroll).toHaveBeenCalledOnce();
  });

  it('disables the Shuffle control while a reroll is in flight', () => {
    render(<EntityColourField colour="#e04667" onReroll={vi.fn()} isPending />);
    expect(screen.getByRole('button', { name: /shuffle/i })).toBeDisabled();
  });
});
