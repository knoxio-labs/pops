import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  RouteDraftCandidateSchema,
  RouteDraftOperationResultSchema,
  RouteDraftOperationSchema,
  RouteDraftPreviewInputSchema,
  RouteDraftPreviewSchema,
  RouteDraftSourceSchema,
} from '../route-draft-schemas.js';
import { RouteOperationSchema } from '../route-schemas.js';

const fingerprint = 'a'.repeat(64);
const candidate = {
  source: { kind: 'visit', id: 1 },
  version: fingerprint,
  confirmed: false,
  selected: true,
  disposition: 'remove',
  reasons: [],
  facts: [],
};
const request = {
  operationId: randomUUID(),
  expectedRevision: 0,
  command: {
    kind: 'path.delete',
    pathId: 1,
    expectedPreviewFingerprint: fingerprint,
    deleteSources: [],
  },
};

describe('source-aware draft deletion contract', () => {
  it('isolates destructive requests from the existing placement command contract', () => {
    expect(RouteDraftOperationSchema.parse(request)).toEqual(request);
    expect(RouteOperationSchema.safeParse(request).success).toBe(false);
    expect(
      RouteDraftOperationSchema.safeParse({
        ...request,
        command: { kind: 'path.apply', pathId: 1 },
      }).success
    ).toBe(false);
    expect(
      RouteDraftOperationSchema.safeParse({
        ...request,
        command: { kind: 'undo', targetOperationId: randomUUID() },
      }).success
    ).toBe(true);
  });

  it('uses exact typed namespaces and rejects duplicates without collapsing equal numeric IDs', () => {
    const sources = [
      { kind: 'visit', id: 1 },
      { kind: 'journey', id: 1 },
      { kind: 'journey-leg', journeyId: 1, id: 1 },
      { kind: 'journey-leg', journeyId: 2, id: 1 },
      { kind: 'stay', id: 1 },
      { kind: 'event', id: 1 },
      { kind: 'rental', id: 1 },
      { kind: 'meeting', id: 1 },
    ];
    expect(RouteDraftPreviewInputSchema.parse({ deleteSources: sources })).toEqual({
      deleteSources: sources,
    });
    expect(RouteDraftPreviewInputSchema.parse({})).toEqual({});
    for (const source of sources) {
      const deleteSources = [source, { ...source }];
      expect(RouteDraftPreviewInputSchema.safeParse({ deleteSources }).success).toBe(false);
      expect(
        RouteDraftOperationSchema.safeParse({
          ...request,
          command: { ...request.command, deleteSources },
        }).success
      ).toBe(false);
    }
  });

  it('rejects unsafe identifiers, unknown source shapes and untyped selection extras', () => {
    for (const id of [0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity]) {
      expect(RouteDraftSourceSchema.safeParse({ kind: 'visit', id }).success).toBe(false);
      expect(
        RouteDraftSourceSchema.safeParse({ kind: 'journey-leg', id: 1, journeyId: id }).success
      ).toBe(false);
    }
    for (const source of [
      { kind: 'place', id: 1 },
      { kind: 'journey-leg', id: 1 },
      { kind: 'visit', id: 1, journeyId: 2 },
      { kind: 'stay', id: '1' },
    ])
      expect(RouteDraftSourceSchema.safeParse(source).success).toBe(false);
    expect(RouteDraftPreviewInputSchema.safeParse({ selection: [] }).success).toBe(false);
    expect(
      RouteDraftPreviewInputSchema.safeParse({
        deleteSources: [{ kind: 'event', id: 1, selected: true }],
      }).success
    ).toBe(false);
    expect(
      RouteDraftSourceSchema.safeParse({ kind: 'visit', id: Number.MAX_SAFE_INTEGER }).success
    ).toBe(true);
  });

  it('requires safe revisions, UUIDs, complete commands and exact snapshot fingerprints', () => {
    for (const expectedRevision of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, undefined])
      expect(RouteDraftOperationSchema.safeParse({ ...request, expectedRevision }).success).toBe(
        false
      );
    for (const expectedPreviewFingerprint of ['', 'a'.repeat(63), 'g'.repeat(64), 'A'.repeat(64)])
      expect(
        RouteDraftOperationSchema.safeParse({
          ...request,
          command: { ...request.command, expectedPreviewFingerprint },
        }).success
      ).toBe(false);
    expect(RouteDraftOperationSchema.safeParse({ ...request, operationId: 'label' }).success).toBe(
      false
    );
    expect(RouteDraftOperationSchema.safeParse({ ...request, extra: true }).success).toBe(false);
    expect(
      RouteDraftOperationSchema.safeParse({
        ...request,
        command: { ...request.command, deleteSources: undefined },
      }).success
    ).toBe(false);
    expect(
      RouteDraftOperationSchema.safeParse({
        ...request,
        command: { ...request.command, pathId: 0 },
      }).success
    ).toBe(false);
  });

  it('preserves canonical facts and requires source-aware proof in every result', () => {
    const facts = ['status', 'arrangement', 'purchase', 'agreement'].map((field) => ({
      field,
      value: null,
    }));
    expect(RouteDraftCandidateSchema.safeParse({ ...candidate, facts }).success).toBe(true);
    for (const invalid of [
      { ...candidate, disposition: 'delete' },
      { ...candidate, reasons: ['draft'] },
      { ...candidate, facts: [{ field: 'booked', value: true }] },
      { ...candidate, facts: [{ field: 'status', value: null, inferred: true }] },
      { ...candidate, version: 'old' },
    ])
      expect(RouteDraftCandidateSchema.safeParse(invalid).success).toBe(false);
    const route = { tripId: 1, revision: 0, order: [], paths: [] };
    const preview = {
      tripId: 1,
      pathId: 1,
      revision: 0,
      fingerprint,
      candidates: [candidate],
      selection: [],
    };
    expect(RouteDraftPreviewSchema.safeParse(preview).success).toBe(true);
    expect(
      RouteDraftPreviewSchema.safeParse({
        ...preview,
        selection: [
          { kind: 'visit', id: 1 },
          { kind: 'visit', id: 1 },
        ],
      }).success
    ).toBe(false);
    const result = {
      receipt: {
        operationId: request.operationId,
        undoneOperationId: null,
        before: route,
        after: route,
        deletion: { pathId: 1, fingerprint, candidates: [candidate] },
      },
      current: route,
      currentSources: [
        { source: { kind: 'visit', id: 1 }, state: 'removed', version: fingerprint },
      ],
      undone: false,
      replayed: false,
    };
    expect(RouteDraftOperationResultSchema.safeParse(result).success).toBe(true);
    expect(
      RouteDraftOperationResultSchema.safeParse({ ...result, currentSources: undefined }).success
    ).toBe(false);
    expect(
      RouteDraftOperationResultSchema.safeParse({
        ...result,
        receipt: { ...result.receipt, deletion: undefined },
      }).success
    ).toBe(false);
    expect(
      RouteDraftOperationResultSchema.safeParse({
        ...result,
        currentSources: [{ source: { kind: 'visit', id: 1 }, state: 'deleted', version: null }],
      }).success
    ).toBe(false);
  });
});
