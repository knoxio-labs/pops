import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RadarChart } from './RadarChart';

describe('RadarChart', () => {
  it('uses the --chart-1..5 ramp for series without an explicit colour', () => {
    const { container } = render(
      <RadarChart
        axes={['a', 'b', 'c']}
        series={[
          { id: 's1', values: [1, 2, 3] },
          { id: 's2', values: [3, 2, 1] },
        ]}
      />
    );

    const polygons = container.querySelectorAll('g > polygon');
    // GridRings polygons have fill="none"; series polygons carry the ramp colour.
    const seriesPolygons = Array.from(polygons).filter((p) => p.getAttribute('fill') !== 'none');

    expect(seriesPolygons[0]?.getAttribute('fill')).toBe('var(--chart-1)');
    expect(seriesPolygons[0]?.getAttribute('stroke')).toBe('var(--chart-1)');
    expect(seriesPolygons[1]?.getAttribute('fill')).toBe('var(--chart-2)');
  });

  it('lets a series override the ramp with an explicit colour', () => {
    const { container } = render(
      <RadarChart axes={['a', 'b']} series={[{ id: 's1', values: [1, 2], color: 'red' }]} />
    );

    const polygons = container.querySelectorAll('g > polygon');
    const seriesPolygon = Array.from(polygons).find((p) => p.getAttribute('fill') !== 'none');

    expect(seriesPolygon?.getAttribute('fill')).toBe('red');
  });
});
