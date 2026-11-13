import { expect, it } from 'vitest';

import { captureSource, sourceCapture, sourceEvent, sourceIdea } from './test-utils';
import { captureTimelineSourceVisible, projectCaptureTimeline } from './timeline-filters';

import type { CaptureTimelineSelection } from './timeline-filters';
import type { CaptureSource } from './types';

const all: CaptureTimelineSelection = { kind: 'all', organisation: 'all', location: 'all' };
const source: CaptureSource = {
  ...captureSource([
    sourceCapture({ id: 1 }),
    sourceCapture({ id: 2, placeId: 88 }),
    sourceCapture({ id: 3, tripId: 8 }),
    sourceCapture({ id: 4, removedAt: '2026-11-12T00:00:00Z' }),
  ]),
  ideas: [sourceIdea({ id: 1 })],
  events: [sourceEvent({ id: 1 })],
  memberships: [
    {
      id: 91,
      revision: 6,
      tripId: 1,
      source: { kind: 'idea', id: 999 },
      removedAt: null,
      createdAt: '',
      updatedAt: '',
    },
  ],
};

it('keeps unassigned, unresolved explicit locations, nonmember sources and unavailable membership identities by default', () => {
  expect(projectCaptureTimeline(source, 1, all, { places: [], visits: [] }).visible).toEqual([
    { kind: 'capture', id: 1 },
    { kind: 'capture', id: 2 },
    { kind: 'idea', id: 1 },
    { kind: 'event', id: 1 },
    { kind: 'idea', id: 999 },
  ]);
  expect(source.memberships[0]).toMatchObject({ id: 91, revision: 6, removedAt: null });
});

it('filters exact kinds despite colliding IDs and never hides unclassified or unrelated source identities', () => {
  const visibility = projectCaptureTimeline(
    source,
    1,
    { ...all, kind: 'capture' },
    { places: [], visits: [] }
  );
  expect(captureTimelineSourceVisible(visibility, { kind: 'capture', id: 1 })).toBe(true);
  expect(captureTimelineSourceVisible(visibility, { kind: 'idea', id: 1 })).toBe(false);
  expect(captureTimelineSourceVisible(visibility, { kind: 'event', id: 1 })).toBe(false);
  expect(captureTimelineSourceVisible(visibility, { kind: 'idea', id: 1000 })).toBe(true);
  for (const kind of ['visit', 'journey', 'stay', 'rental', 'meeting', 'decision'])
    expect(captureTimelineSourceVisible(visibility, { kind, id: 1 })).toBe(true);
});

it('uses explicit unassigned/place/visit filters without guessing missing member locations', () => {
  const unassigned = projectCaptureTimeline(
    source,
    1,
    { ...all, location: 'unassigned' },
    { places: [], visits: [] }
  ).visible;
  expect(unassigned).toContainEqual({ kind: 'capture', id: 1 });
  expect(unassigned).not.toContainEqual({ kind: 'capture', id: 2 });
  expect(unassigned).not.toContainEqual({ kind: 'event', id: 1 });
  expect(unassigned).toContainEqual({ kind: 'idea', id: 999 });
  expect(
    projectCaptureTimeline(
      source,
      1,
      { ...all, location: { kind: 'place', id: 88 } },
      { places: [], visits: [] }
    ).visible
  ).toEqual([
    { kind: 'capture', id: 2 },
    { kind: 'idea', id: 999 },
  ]);
  expect(
    projectCaptureTimeline(
      source,
      1,
      { ...all, location: { kind: 'visit', id: 3 } },
      { places: [], visits: [] }
    ).visible
  ).toEqual([
    { kind: 'event', id: 1 },
    { kind: 'idea', id: 999 },
  ]);
});

it('reuses canonical organisation availability and keeps unknown non-Capture organisation independent', () => {
  const associated: CaptureSource = {
    ...source,
    associations: [
      {
        id: 4,
        captureId: 1,
        tripId: 1,
        revision: 1,
        removedAt: null,
        createdAt: '',
        updatedAt: '',
        target: { kind: 'idea', id: 1 },
        provenance: 'existing',
        sourceRevision: 1,
      },
    ],
  };
  const rows = projectCaptureTimeline(
    associated,
    1,
    { ...all, organisation: 'organised' },
    { places: [], visits: [] }
  ).visible;
  expect(rows).toContainEqual({ kind: 'capture', id: 1 });
  expect(rows).not.toContainEqual({ kind: 'capture', id: 2 });
  expect(rows).toContainEqual({ kind: 'idea', id: 999 });
  expect(rows).toContainEqual({ kind: 'event', id: 1 });
});
