import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EntityLookupUnavailableNotice } from './EntityLookupUnavailableNotice';

describe('EntityLookupUnavailableNotice', () => {
  it('names Contacts as the cause and offers a retry', () => {
    const onRetry = vi.fn();
    render(<EntityLookupUnavailableNotice onRetry={onRetry} />);

    expect(screen.getByText('Contacts unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
