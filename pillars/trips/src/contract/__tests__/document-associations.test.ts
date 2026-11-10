import { describe, expect, it } from 'vitest';

import {
  DocumentTargetKindSchema,
  TripDocumentAssociationSchema,
} from '../document-associations.js';

describe('Trip document association contract', () => {
  it('accepts the approved explicit target kinds and numeric Documents identity', () => {
    for (const targetKind of ['trip', 'visit', 'journey', 'stay', 'event']) {
      expect(DocumentTargetKindSchema.parse(targetKind)).toBe(targetKind);
      expect(
        TripDocumentAssociationSchema.parse({
          id: 1,
          tripId: 2,
          documentId: 42,
          targetKind,
          targetId: 3,
          createdAt: '2026-11-10T00:00:00.000Z',
        }).documentId
      ).toBe(42);
    }
  });

  it('rejects inferred or unsupported target kinds and nonpositive source identities', () => {
    expect(DocumentTargetKindSchema.safeParse('booking').success).toBe(false);
    expect(
      TripDocumentAssociationSchema.safeParse({
        id: 1,
        tripId: 2,
        documentId: 'document-42',
        targetKind: 'visit',
        targetId: 3,
        createdAt: '2026-11-10T00:00:00.000Z',
      }).success
    ).toBe(false);
  });
});
