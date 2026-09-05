import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Sparkline } from './Sparkline';

const points = (values: number[]) => values.map((value, index) => ({ label: `m${index}`, value }));

describe('Sparkline', () => {
  it('renders nothing for fewer than two points — one reading is not a trend', () => {
    const { container } = render(<Sparkline points={points([42])} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders nothing for an empty series', () => {
    const { container } = render(<Sparkline points={[]} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('draws one polyline vertex per point', () => {
    const { container } = render(<Sparkline points={points([1, 2, 3, 4])} />);
    const polyline = container.querySelector('polyline');
    expect(polyline?.getAttribute('points')?.split(' ')).toHaveLength(4);
  });

  it('puts the highest value at the top of the box and the lowest at the bottom', () => {
    const { container } = render(<Sparkline points={points([10, 30, 20])} />);
    const ys = (container.querySelector('polyline')?.getAttribute('points') ?? '')
      .split(' ')
      .map((pair) => Number(pair.split(',')[1]));
    expect(ys[1]).toBeLessThan(ys[2] ?? 0);
    expect(ys[0]).toBeGreaterThan(ys[2] ?? 0);
  });

  it('survives a flat series without dividing by a zero span', () => {
    const { container } = render(<Sparkline points={points([5, 5, 5])} />);
    const ys = (container.querySelector('polyline')?.getAttribute('points') ?? '')
      .split(' ')
      .map((pair) => Number(pair.split(',')[1]));
    expect(ys.every((y) => Number.isFinite(y))).toBe(true);
  });

  it('names the span it covers by default, and takes an override', () => {
    const { rerender } = render(<Sparkline points={points([1, 2])} />);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Trend from m0 to m1');

    rerender(<Sparkline points={points([1, 2])} label="Balance over 12 months" />);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Balance over 12 months');
  });

  it('omits the fill when asked', () => {
    const { container } = render(<Sparkline points={points([1, 2, 3])} filled={false} />);
    expect(container.querySelector('polygon')).toBeNull();
  });
});
