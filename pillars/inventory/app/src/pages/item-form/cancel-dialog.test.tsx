import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CancelDialog } from './cancel-dialog';

describe('item form cancel dialog', () => {
  it('offers a destructive discard action for a create draft', () => {
    const onDiscard = vi.fn();
    render(<CancelDialog open mode="create" onOpenChange={vi.fn()} onDiscard={onDiscard} />);

    expect(screen.getByText('Discard this new item?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Discard item' }));
    expect(onDiscard).toHaveBeenCalledOnce();
  });
});
