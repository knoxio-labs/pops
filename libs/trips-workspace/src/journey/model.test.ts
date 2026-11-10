import { describe, expect, it } from 'vitest';

import { draftJourney, endpointText, journeySource, legSource, sameJourney } from './model';
import { sourceJourney, sourceLeg } from './test-utils';

describe('Independent journey source edits', () => {
  it('clears only the explicitly selected endpoint member and retains opaque provenance and place identity', () => {
    const endpoint = sourceLeg().from;
    const changed = endpointText(endpoint, 'local', '');
    expect(changed).toEqual({
      sourceLabel: 'Old wharf',
      placeId: 51,
      sourceLinks: endpoint.sourceLinks,
    });
    expect(endpoint.local).toBe('2029-02-01T22:15');
    expect(endpointText(changed, 'timeZone', 'Pacific/Auckland')).toEqual({
      ...changed,
      timeZone: 'Pacific/Auckland',
    });
  });
  it('snapshots all source fields but excludes owning identities and audit timestamps', () => {
    expect(journeySource(sourceJourney())).not.toHaveProperty('id');
    const snapshot = legSource(sourceLeg());
    expect(snapshot).not.toHaveProperty('createdAt');
    expect(snapshot).toMatchObject({
      arrangement: 'Booked',
      intention: 'Considering',
      purchase: null,
      sourceLinks: sourceLeg().sourceLinks,
    });
  });
  it('keeps purchase orthogonal and never borrows clocks or modes from another leg', () => {
    const source = {
      legRevision: 0,
      journey: sourceJourney(),
      legs: [sourceLeg(), sourceLeg({ id: 41, from: {}, to: {}, mode: null })],
    };
    const next = draftJourney(source, { kind: 'leg', id: 40, patch: { purchase: 'Purchased' } });
    expect(next.legs[0]).toMatchObject({
      arrangement: 'Booked',
      intention: 'Considering',
      purchase: 'Purchased',
    });
    expect(next.legs[1]).toEqual(source.legs[1]);
    expect(source.legs[0]?.purchase).toBeNull();
  });
  it('detects source/order changes while ignoring audit-only refreshes', () => {
    const source = {
      legRevision: 0,
      journey: sourceJourney(),
      legs: [sourceLeg(), sourceLeg({ id: 41 })],
    };
    expect(
      sameJourney(source, {
        ...source,
        legRevision: 0,
        journey: sourceJourney({ updatedAt: '2029-02-02T00:00:00Z' }),
      })
    ).toBe(true);
    expect(sameJourney(source, { ...source, legs: source.legs.toReversed() })).toBe(false);
    expect(
      sameJourney(source, draftJourney(source, { kind: 'journey', patch: { buffers: {} } }))
    ).toBe(false);
  });
});
