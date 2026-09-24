import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SuccessBurst } from './SuccessBurst';

describe('SuccessBurst', () => {
  it('is announced by its label, not by its decoration', () => {
    render(<SuccessBurst label="Device paired" />);

    expect(screen.getByRole('img', { name: 'Device paired' })).toBeInTheDocument();
    // One accessible node: the rings, confetti and check are all hidden from
    // assistive tech, so a screen reader hears the label once and nothing else.
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('drops every moving piece under reduced motion', () => {
    render(<SuccessBurst label="Device paired" />);

    const moving = [
      ...screen.getAllByTestId('success-burst-ring'),
      ...screen.getAllByTestId('success-burst-confetti'),
    ];
    expect(moving.length).toBeGreaterThan(0);
    for (const piece of moving) {
      expect(piece).toHaveClass('motion-reduce:hidden');
    }
  });

  it('sends each piece of confetti somewhere different', () => {
    render(<SuccessBurst label="Device paired" />);

    const destinations = screen.getAllByTestId('success-burst-confetti').map((piece) =>
      [...piece.classList]
        .filter((c) => c.includes('translate-'))
        .toSorted()
        .join(' ')
    );
    expect(new Set(destinations).size).toBe(destinations.length);
  });
});
