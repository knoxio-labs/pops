import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CanonicalIdentityNotice } from './CanonicalIdentityNotice';

describe('canonical contact identity verification states', () => {
  it('shows a retryable failure without presenting an empty or missing identity result', () => {
    const retry = vi.fn();
    render(<CanonicalIdentityNotice status="unavailable" retry={retry} />);
    expect(screen.getByText('Contact identities unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it('keeps checking distinct from a completed verification', () => {
    const { rerender } = render(<CanonicalIdentityNotice status="checking" retry={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Checking contact identities');
    rerender(<CanonicalIdentityNotice status="ready" retry={vi.fn()} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
