import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { OFFLINE_TITLE, StateBanner } from './state-banner';

describe('StateBanner', () => {
  it('uses alert roles for conflict and error, status for other states', () => {
    const { rerender } = render(<StateBanner kind="conflict" title="Conflict" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Conflict');

    rerender(<StateBanner kind="error" title="Error" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Error');

    rerender(<StateBanner kind="stale" title="Stale" />);
    expect(screen.getByRole('status')).toHaveTextContent('Stale');
    rerender(<StateBanner kind="offline" title={OFFLINE_TITLE} />);
    expect(screen.getByRole('status')).toHaveTextContent(OFFLINE_TITLE);
  });

  it('renders one optional action and calls it', () => {
    const onAction = vi.fn();
    const { rerender } = render(
      <StateBanner
        kind="needs-attention"
        title="Needs attention"
        actionLabel="Open Sync"
        onAction={onAction}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open Sync' }));
    expect(onAction).toHaveBeenCalledOnce();

    rerender(<StateBanner kind="offline" title="Offline" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
