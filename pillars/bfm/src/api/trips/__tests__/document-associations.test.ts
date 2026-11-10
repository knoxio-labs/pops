import { describe, expect, it } from 'vitest';

import { tripsEventFixture, tripsFixture } from './fixtures.js';
import { tripsClientOver } from './gateway.js';

import type { MobileTripDocumentAssociation } from '../../../contract/mobile-trips-document-schemas.js';

const targets: readonly { kind: MobileTripDocumentAssociation['targetKind']; id: number }[] = [
  { kind: 'trip', id: 7 },
  { kind: 'visit', id: 21 },
  { kind: 'journey', id: 40 },
  { kind: 'stay', id: 70 },
  { kind: 'event', id: 80 },
];
function association(
  targetKind: MobileTripDocumentAssociation['targetKind'],
  targetId: number
): MobileTripDocumentAssociation {
  return {
    id: 90,
    tripId: 7,
    documentId: 31,
    targetKind,
    targetId,
    createdAt: '2027-01-01T00:00:00Z',
  };
}
describe('Trips-owned document association reader', () => {
  it('retains distinct crosslinks and original IDs without requiring Documents access or inferring availability', async () => {
    const detail = tripsFixture();
    detail.events = [tripsEventFixture()];
    detail.documentAssociations = targets.map((target, index) => ({
      ...association(target.kind, target.id),
      id: 90 + index,
    }));
    const before = structuredClone(detail);
    const { client, calls } = tripsClientOver(detail);
    expect(await client.getTrip(7)).toMatchObject({
      kind: 'ok',
      value: { documentAssociations: detail.documentAssociations },
    });
    expect(calls.filter((call) => call.operation === 'documentAssociations.list')).toEqual([
      { operation: 'documentAssociations.list', input: { tripId: 7 } },
    ]);
    expect(calls.some((call) => call.operation.startsWith('paperless.'))).toBe(false);
    expect(detail).toEqual(before);
  });
  it.each(targets)('rejects a foreign or missing $kind target', async ({ kind }) => {
    const detail = tripsFixture();
    detail.documentAssociations = [association(kind, 999)];
    expect(await tripsClientOver(detail).client.getTrip(7)).toMatchObject({
      kind: 'contract-mismatch',
      status: 502,
    });
  });
  it.each(['wrong owner', 'duplicate identity'] as const)(
    'rejects association %s',
    async (fault) => {
      const detail = tripsFixture();
      const source = association('trip', 7);
      if (fault === 'wrong owner') source.tripId = 8;
      detail.documentAssociations = fault === 'duplicate identity' ? [source, source] : [source];
      expect(await tripsClientOver(detail).client.getTrip(7)).toMatchObject({
        kind: 'contract-mismatch',
        status: 502,
      });
    }
  );
  it('does not invent an empty association array when the producer omits it', async () => {
    expect(
      await tripsClientOver(tripsFixture(), {
        associations: { kind: 'ok', value: {} },
      }).client.getTrip(7)
    ).toMatchObject({ kind: 'contract-mismatch', status: 502 });
  });
});
