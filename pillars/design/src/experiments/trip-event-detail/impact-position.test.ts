import { formatRouteGap } from '@/fixtures/trip-overview-format';
import { describe, expect, it } from 'vitest';

import { initialCanvas } from '../trip-route-editing/canvas-model';
import { routePositionOptions } from './impact-position';

describe('routePositionOptions', () => {
  it('distinguishes default route anchors and names transport airport routes and open segments', () => {
    const state = initialCanvas('default');
    const options = routePositionOptions(state);
    const labels = options.map((option) => option.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(options.find((option) => option.value === 'after:flight')?.label).toContain(
      'SYD → DFW → GRU'
    );
    const gap = state.records.find(
      (record) => record.kind === 'gap' && state.order.includes(record.id)
    );
    expect(gap).toBeDefined();
    if (!gap) throw new Error('Expected an explicit open segment in the source fixture');
    expect(options.find((option) => option.value === `after:${gap.id}`)?.label).toBe(
      `After Alternatives · ${formatRouteGap(gap, state.records)}`
    );
  });

  it('disambiguates repeated source descriptions using explicit route positions', () => {
    const state = initialCanvas('empty');
    const city = {
      id: 'one',
      kind: 'city' as const,
      placeId: 'sydney',
      intention: 'Considering' as const,
      arrangement: 'Not needed' as const,
      notes: '',
    };
    state.records = [city, { ...city, id: 'two' }];
    state.order = ['one', 'two'];
    const options = routePositionOptions(state);
    expect(options[1]?.label).toContain('route position 1');
    expect(options[2]?.label).toContain('route position 2');
    expect(options[1]?.label).not.toBe(options[2]?.label);
  });

  it('disables a missing route record without exposing its internal identity', () => {
    const state = initialCanvas('empty');
    state.order = ['missing-internal-id'];
    expect(routePositionOptions(state)[1]).toEqual({
      value: 'after:missing-internal-id',
      label: 'Unavailable route item',
      disabled: true,
    });
  });
});
