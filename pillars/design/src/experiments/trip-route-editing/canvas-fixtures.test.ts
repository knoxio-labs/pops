import { describe, expect, it } from 'vitest';

import { initialCanvas } from './canvas-model';
import { initialRouteCanvas } from './path-fixtures';

describe('route fixture composition', () => {
  it('preserves the shared source identities used by alternative and arrangement contexts', () => {
    const shared = initialCanvas('default');
    expect(shared.sections.map((section) => section.id)).toEqual([
      'section-northeast',
      'section-minas',
      'section-es',
      'section-curitiba-return',
    ]);
    expect(shared.records.some((record) => record.id === 'coast-stay')).toBe(false);
    expect(Object.keys(shared.transitLinks)).toEqual(['flight', 'connection', 'return-flight']);
  });

  it('adds the approved complete paths only to the Direct route fixture', () => {
    const shared = initialCanvas('default');
    const route = initialRouteCanvas('default');
    expect(route.sections.map((section) => section.id)).toEqual(['path-coast', 'path-minas']);
    expect(route.sections.every((section) => section.cards.length === 3)).toBe(true);
    expect(route.order).toEqual(shared.order);
    expect(
      route.records.filter(
        (record) =>
          shared.records.some((source) => source.id === record.id) && record.kind !== 'gap'
      )
    ).toEqual(shared.records.filter((record) => record.kind !== 'gap'));
    expect(new Set(route.records.map((record) => record.id)).size).toBe(route.records.length);
    expect(initialRouteCanvas('empty')).toEqual(initialCanvas('empty'));
  });

  it('does not leak changed path endpoints into another route instance', () => {
    const route = initialRouteCanvas('default');
    const link = route.transitLinks['coast-flight'];
    if (!link) throw new Error('Missing route transport fixture');
    link.from = 'changed';
    expect(initialRouteCanvas('default').transitLinks['coast-flight']?.from).toBe('coast-maceio');
  });
});
