import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ErrorState } from './ErrorAlert';

const error = {
  code: 'inventory.items.not_found',
  message: 'Item not found',
  requestId: 'req-123',
  retryable: false,
};

describe('ErrorState', () => {
  it('renders the message and code, then discloses the request ID', async () => {
    const user = userEvent.setup();
    render(<ErrorState error={error} />);

    expect(screen.getByRole('heading', { name: 'Item not found' })).toBeInTheDocument();
    expect(screen.getByLabelText('Error code')).toHaveTextContent('inventory.items.not_found');
    expect(screen.queryByText('req-123')).not.toBeVisible();

    await user.click(screen.getByText('Show details'));
    expect(screen.getByText('req-123')).toBeVisible();
  });

  it('offers the supplied retry action', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorState error={error} onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
