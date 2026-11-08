import { describe, expect, it } from 'vitest';

import { initialSettings } from './fixture';
import { routeSummary } from './timing-model';

describe('ordered route boundaries', () => {
  it('uses first departure and leaves an unknown last arrival open', () => {
    const state = initialSettings('existing');
    const before = structuredClone(state);
    expect(routeSummary(state.route)).toEqual({
      label: '24 Nov 2027 →',
      sourceIds: ['journey-syd-gru'],
      hasDates: true,
      openStart: false,
      openEnd: true,
    });
    expect(state).toEqual(before);
  });

  it('never substitutes inner known dates for unknown or invalid boundaries', () => {
    expect(routeSummary(initialSettings('open-route').route)).toEqual({
      label: '',
      sourceIds: [],
      hasDates: true,
      openStart: true,
      openEnd: true,
    });
    const route = initialSettings('existing').route;
    const first = route[0];
    if (first) first.start = '2028-02-30';
    expect(routeSummary(route)).toEqual({
      label: '',
      sourceIds: [],
      hasDates: true,
      openStart: true,
      openEnd: true,
    });
    expect(routeSummary([])).toEqual({
      label: '',
      sourceIds: [],
      hasDates: false,
      openStart: true,
      openEnd: true,
    });
  });

  it('formats only valid available boundaries including a single shared source', () => {
    const route = [
      { id: 'one', title: 'Visit', kind: 'visit' as const, start: '', end: '2028-02-29' },
    ];
    expect(routeSummary(route)).toEqual({
      label: '→ 29 Feb 2028',
      sourceIds: ['one'],
      hasDates: true,
      openStart: true,
      openEnd: false,
    });
    const first = route[0];
    if (!first) throw new Error('Expected the route source');
    first.start = '2028-02-01';
    expect(routeSummary(route)).toEqual({
      label: '1 Feb 2028 → 29 Feb 2028',
      sourceIds: ['one'],
      hasDates: true,
      openStart: false,
      openEnd: false,
    });
  });
});
