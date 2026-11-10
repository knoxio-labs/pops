import { describe, expect, it } from 'vitest';

import { documentTargetLabel, groupDocumentAssociations, uploadFileProblem } from './model';

const association = (
  id: number,
  targetKind: 'trip' | 'visit' | 'journey' | 'stay' | 'event',
  targetId: number
) => ({
  id,
  tripId: 4,
  documentId: id + 100,
  targetKind,
  targetId,
  createdAt: '2026-11-09T00:00:00.000Z',
});

describe('document association display model', () => {
  it('shows trip originals first, orders explicit visits by route and keeps other source identities distinct', () => {
    const grouped = groupDocumentAssociations(
      [
        association(1, 'journey', 8),
        association(2, 'trip', 4),
        association(3, 'visit', 9),
        association(4, 'visit', 8),
        association(5, 'journey', 9),
      ],
      [8, 9]
    );
    expect(grouped.trip.map((item) => item.id)).toEqual([2]);
    expect(
      grouped.visits.map(({ visitId, targets }) => [
        visitId,
        targets.map(({ target }) => target.id),
      ])
    ).toEqual([
      [8, [8]],
      [9, [9]],
    ]);
    expect(grouped.targets.map(({ target }) => [target.kind, target.id])).toEqual([
      ['journey', 8],
      ['journey', 9],
    ]);
  });

  it('does not treat a trip-kind association with another target identity as trip-wide', () => {
    const grouped = groupDocumentAssociations([association(1, 'trip', 99)]);
    expect(grouped.trip).toEqual([]);
    expect(grouped.targets[0]?.target).toEqual({ kind: 'trip', id: 99 });
  });

  it('nests stay and event links only under their published visit identity', () => {
    const grouped = groupDocumentAssociations(
      [association(1, 'stay', 9), association(2, 'event', 10)],
      [8],
      new Map([
        ['stay:9', { name: 'Harbour hotel', visitId: 8 }],
        ['event:10', { name: 'Museum', visitId: null }],
      ])
    );
    expect(
      grouped.visits.map(({ visitId, targets }) => [
        visitId,
        targets.map(({ target }) => target.kind),
      ])
    ).toEqual([[8, ['stay']]]);
    expect(grouped.targets.map(({ target }) => target.kind)).toEqual(['event']);
  });

  it('labels only the explicit target identity', () => {
    expect(documentTargetLabel({ kind: 'journey', id: 27 })).toBe('Journey 27');
    expect(documentTargetLabel({ kind: 'visit', id: 8 })).toBe('Visit 8');
    expect(
      documentTargetLabel(
        { kind: 'visit', id: 8 },
        new Map([['visit:8', { name: 'Lisbon', visitId: 8 }]])
      )
    ).toBe('Lisbon');
  });
});

describe('uploadFileProblem', () => {
  const policy = {
    configured: true,
    available: true,
    maxUploadBytes: 100,
    allowedMimeTypes: ['application/pdf'],
  };

  it('rejects unavailable owner, over-limit files and MIME types outside the source allowlist', () => {
    expect(uploadFileProblem({ name: 'a.pdf', size: 1, type: 'application/pdf' }, null)).toContain(
      'unavailable'
    );
    expect(
      uploadFileProblem({ name: 'a.pdf', size: 101, type: 'application/pdf' }, policy)
    ).toContain('upload limit');
    expect(uploadFileProblem({ name: 'a.txt', size: 1, type: 'text/plain' }, policy)).toContain(
      'unsupported'
    );
  });

  it('honours the owner wildcard MIME categories without broadening other types', () => {
    const wildcardPolicy = {
      ...policy,
      allowedMimeTypes: ['application/pdf', 'image/*', 'text/*'],
    };
    expect(
      uploadFileProblem({ name: 'a.png', size: 1, type: 'image/png' }, wildcardPolicy)
    ).toBeUndefined();
    expect(
      uploadFileProblem({ name: 'a.csv', size: 1, type: 'text/csv' }, wildcardPolicy)
    ).toBeUndefined();
    expect(
      uploadFileProblem({ name: 'a.json', size: 1, type: 'application/json' }, wildcardPolicy)
    ).toContain('unsupported');
    expect(uploadFileProblem({ name: 'a.png', size: 1, type: 'image/png' }, policy)).toContain(
      'unsupported'
    );
  });

  it('does not guess a MIME type from the extension when the browser supplies none', () => {
    expect(uploadFileProblem({ name: 'a.pdf', size: 100, type: '' }, policy)).toContain(
      'unsupported'
    );
  });

  it('accepts exact owner-configured limits and MIME types at the boundary', () => {
    expect(
      uploadFileProblem({ name: 'a.pdf', size: 100, type: 'application/pdf' }, policy)
    ).toBeUndefined();
  });
});
