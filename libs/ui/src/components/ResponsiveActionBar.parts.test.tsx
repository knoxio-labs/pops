import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '../primitives/tooltip';
import { StaleButton } from './ResponsiveActionBar.parts';

describe('StaleButton', () => {
  it('makes the scoring effect available from a touch-sized details trigger', async () => {
    const user = userEvent.setup();
    const onStale = vi.fn();

    render(
      <TooltipProvider>
        <StaleButton
          movie={{ id: 42, title: 'Arrival' }}
          testId="stale-arrival-button"
          onStale={onStale}
        />
      </TooltipProvider>
    );

    const detailsButton = screen.getByRole('button', { name: 'Stale status details' });
    expect(detailsButton).toHaveClass('h-11', 'w-11');

    await user.click(detailsButton);

    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'Mark as stale — reduces score weight for future comparisons'
    );
    expect(onStale).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Mark Arrival as stale' }));

    expect(onStale).toHaveBeenCalledExactlyOnceWith(42);
  });
});
