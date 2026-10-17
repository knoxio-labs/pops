import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FragileIcon } from './FragileIcon';

describe('FragileIcon', () => {
  it('exposes the cracked-glass symbol by its accessible name', () => {
    render(<FragileIcon />);

    expect(screen.getByRole('img', { name: 'Fragile: cracked glass' })).toBeInTheDocument();
  });

  it('uses the same default dimensions and accepts a custom size', () => {
    const { rerender } = render(<FragileIcon />);
    const icon = screen.getByRole('img', { name: 'Fragile: cracked glass' });

    expect(icon).toHaveAttribute('width', '24');
    expect(icon).toHaveAttribute('height', '24');

    rerender(<FragileIcon size="24mm" />);

    expect(icon).toHaveAttribute('width', '24mm');
    expect(icon).toHaveAttribute('height', '24mm');
  });

  it('includes the cracked-glass path', () => {
    const { container } = render(<FragileIcon />);

    expect(
      container.querySelector('path[d="m35 5-8 13 10 7-9 10 4 8M32 43v16M21 59h22"]')
    ).toBeInTheDocument();
  });
});
