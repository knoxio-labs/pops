import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { OFFLINE_REASON, OFFLINE_TITLE, StateBanner } from './state-banner';

describe('StateBanner', () => {
  it('uses an alert role for conflict and error, and status for other states', () => {
    const { rerender } = render(<StateBanner kind="conflict" title="Conflict" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Conflict');

    rerender(<StateBanner kind="error" title="Error" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Error');

    for (const kind of ['stale', 'offline', 'needs-attention'] as const) {
      rerender(<StateBanner kind={kind} title={kind} />);
      expect(screen.getByRole('status')).toHaveTextContent(kind);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    }
  });

  it('keeps the approved offline copy available to consumers', () => {
    render(<StateBanner kind="offline" title={OFFLINE_TITLE} detail={OFFLINE_REASON} />);

    expect(screen.getByRole('status')).toHaveTextContent(OFFLINE_TITLE);
    expect(screen.getByRole('status')).toHaveTextContent(OFFLINE_REASON);
  });

  it('renders at most one optional action and invokes it', () => {
    const onAction = vi.fn();
    const { rerender } = render(
      <StateBanner
        kind="needs-attention"
        title="Needs attention"
        actionLabel="Open Sync"
        onAction={onAction}
      />
    );

    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Open Sync' }));
    expect(onAction).toHaveBeenCalledOnce();

    rerender(<StateBanner kind="offline" title="Offline" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
