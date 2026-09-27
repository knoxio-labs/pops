import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LoadError } from './load-error';

describe('LoadError', () => {
  it('is an alert and Retry calls onRetry', () => {
    const onRetry = vi.fn();
    render(
      <LoadError
        title="Could not load items."
        detail="Try again when the connection is available."
        onRetry={onRetry}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load items.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
