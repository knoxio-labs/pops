import { describe, expect, it } from 'vitest';

import { durationLabel, journeyTitle } from './display';
import { initialJourney } from './fixture';

describe('journey display', () => {
  it('rolls rounded minutes into hours and omits unknown or invalid durations', () => {
    expect(durationLabel(59.6)).toBe('1h');
    expect(durationLabel(0)).toBe('0m');
    expect(durationLabel(undefined)).toBe('');
    expect(durationLabel(-1)).toBe('');
    expect(durationLabel(Number.NaN)).toBe('');
  });
  it('uses catalogue codes and preserves changed connection airports', () => {
    const source = initialJourney('default');
    expect(journeyTitle(source)).toBe('SYD → DFW → GRU');
    const second = source.legs[1];
    if (!second) throw new Error('Second fixture leg missing');
    second.from.locationId = 'office';
    expect(journeyTitle(source)).toBe('SYD → DFW → OFFICE → GRU');
  });
});
