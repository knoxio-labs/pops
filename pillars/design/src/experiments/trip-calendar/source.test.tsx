import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AvailabilitySource } from './source';

describe('floating availability source inspection', () => {
  it('keeps invalid source date text inspectable without formatting it as an instant', () => {
    render(
      <AvailabilitySource
        availability={{
          id: 'source-invalid',
          contactId: 'contact',
          name: 'Rui',
          city: 'Olinda',
          from: '2027-02-30',
          to: 'unknown',
          status: 'Available',
        }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open Rui availability' }));
    const dialog = screen.getByRole('dialog', { name: 'Rui' });
    expect(dialog).toHaveTextContent('Invalid source date: 2027-02-30');
    expect(dialog).toHaveTextContent('Invalid source date: unknown');
    expect(dialog).not.toHaveTextContent('00:00');
  });
});
