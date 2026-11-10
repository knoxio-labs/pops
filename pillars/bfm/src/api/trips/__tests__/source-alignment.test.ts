import { describe, expect, it } from 'vitest';

import { MobileVisitTimingSchema } from '../../../contract/mobile-trips-schemas.js';
import { tripsFixture, tripsEventFixture } from './fixtures.js';
import { tripsClientOver } from './gateway.js';

describe('reader-first source alignment', () => {
  it.each([{ min: 0 }, { min: 3 }, { max: 2 }, { min: 1, max: 4 }])(
    'preserves supplied duration bounds $min/$max',
    async (bounds) => {
      const detail = tripsFixture();
      const visit = detail.visits.at(0);
      expect(visit).toBeDefined();
      if (!visit) return;
      visit.timing = { duration: { ...bounds, unit: 'weeks' } };
      const result = await tripsClientOver(detail).client.getTrip(7);
      expect(result).toMatchObject({
        kind: 'ok',
        value: { visits: [{ timing: visit.timing }, detail.visits[1]] },
      });
      expect(MobileVisitTimingSchema.parse(visit.timing)).toEqual(visit.timing);
    }
  );
  it.each([{}, { min: -1 }, { max: -1 }, { min: 4, max: 2 }])(
    'rejects invalid duration without supplying missing bounds',
    (bounds) => {
      expect(
        MobileVisitTimingSchema.safeParse({ duration: { ...bounds, unit: 'days' } }).success
      ).toBe(false);
    }
  );
  it('requires an explicit duration unit', () => {
    expect(MobileVisitTimingSchema.safeParse({ duration: { min: 2 } }).success).toBe(false);
  });
  it('retains event optional precision, independent lifecycle and opaque links verbatim', async () => {
    const detail = tripsFixture();
    detail.events = [
      tripsEventFixture(),
      { ...tripsEventFixture(), id: 81, visitId: null, timing: {} },
    ];
    const before = structuredClone(detail);
    expect(await tripsClientOver(detail).client.getTrip(7)).toMatchObject({
      kind: 'ok',
      value: { events: detail.events },
    });
    expect(detail).toEqual(before);
  });
  it.each(['wrong owner', 'missing visit', 'duplicate identity'] as const)(
    'rejects event %s',
    async (fault) => {
      const detail = tripsFixture();
      const source = tripsEventFixture();
      if (fault === 'wrong owner') source.tripId = 8;
      if (fault === 'missing visit') source.visitId = 999;
      detail.events = fault === 'duplicate identity' ? [source, source] : [source];
      expect(await tripsClientOver(detail).client.getTrip(7)).toMatchObject({
        kind: 'contract-mismatch',
        status: 502,
      });
    }
  );
  it('rejects an omitted event collection rather than inventing an empty source', async () => {
    expect(
      await tripsClientOver(tripsFixture(), { events: { kind: 'ok', value: {} } }).client.getTrip(7)
    ).toMatchObject({ kind: 'contract-mismatch', status: 502 });
  });
});
