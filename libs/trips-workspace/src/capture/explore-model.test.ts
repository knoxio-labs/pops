import { describe, expect, it } from 'vitest';

import { projectExploreRows } from './explore-model';
import { captureSource, sourceCapture, sourceEvent } from './test-utils';

import type { Place, Visit } from '../stay/types';
import type { CaptureSource } from './types';

const membership = (
  id: number,
  source: CaptureSource['memberships'][number]['source'],
  removedAt: string | null = null
): CaptureSource['memberships'][number] => ({
  id,
  tripId: 1,
  source,
  revision: 1,
  removedAt,
  createdAt: '2026-11-10T00:00:00.000Z',
  updatedAt: '2026-11-10T00:00:00.000Z',
});
const place = (id: number, name: string): Place => ({
  id,
  name,
  sourceLinks: [],
  createdAt: '',
  updatedAt: '',
});
const visit = (id: number, placeId: number): Visit => ({
  id,
  tripId: 1,
  placeId,
  revision: 0,
  notes: '',
  sourceLinks: [],
  timing: {},
  createdAt: '',
  updatedAt: '',
});

describe('Explore projection', () => {
  it('keeps an existing Event available when its explicit visit or place context is unavailable', () => {
    const source: CaptureSource = {
      ...captureSource(),
      events: [sourceEvent()],
      memberships: [membership(8, { kind: 'event', id: 7 })],
    };
    expect(projectExploreRows(source, [], [])).toMatchObject([
      {
        source: { kind: 'event', id: 7 },
        unavailable: false,
        location: { kind: 'unavailable', kindOfReference: 'visit', id: 3 },
      },
    ]);
    expect(projectExploreRows(source, [], [visit(3, 2)])).toMatchObject([
      {
        source: { kind: 'event', id: 7 },
        unavailable: false,
        location: { kind: 'unavailable', kindOfReference: 'place', id: 2 },
      },
    ]);
    expect(projectExploreRows({ ...source, events: [] }, [], [visit(3, 2)])).toMatchObject([
      { source: { kind: 'event', id: 7 }, unavailable: true },
    ]);
  });
  it('keeps same-name places distinct and preserves source raw text and membership revision', () => {
    const source: CaptureSource = {
      ...captureSource([
        sourceCapture({ id: 10, title: 'Idea', originalText: 'raw', placeId: 1 }),
        sourceCapture({ id: 11, title: 'Idea', placeId: 2 }),
      ]),
      memberships: [
        membership(4, { kind: 'capture', id: 10 }),
        membership(5, { kind: 'capture', id: 11 }),
      ],
    };
    expect(projectExploreRows(source, [place(1, 'Paris'), place(2, 'Paris')], [])).toMatchObject([
      {
        membershipId: 4,
        membershipRevision: 1,
        source: { kind: 'capture', id: 10 },
        label: 'Idea',
        text: 'raw',
        location: { kind: 'place', id: 1 },
      },
      { membershipId: 5, source: { kind: 'capture', id: 11 }, location: { kind: 'place', id: 2 } },
    ]);
  });

  it('marks null locations unassigned, dangling explicit locations unavailable, and omits removed memberships', () => {
    const source: CaptureSource = {
      ...captureSource([
        sourceCapture({ id: 1 }),
        sourceCapture({ id: 2, placeId: 88 }),
        sourceCapture({ id: 3, removedAt: '2026-11-10T00:00:00.000Z' }),
      ]),
      memberships: [
        membership(1, { kind: 'capture', id: 1 }),
        membership(2, { kind: 'capture', id: 2 }),
        membership(3, { kind: 'capture', id: 3 }),
        membership(4, { kind: 'capture', id: 1 }, '2026-11-10T00:00:00.000Z'),
        membership(5, { kind: 'capture', id: 99 }),
      ],
    };
    expect(projectExploreRows(source, [], [])).toMatchObject([
      { location: { kind: 'unassigned' }, unavailable: false },
      { location: { kind: 'unavailable', kindOfReference: 'place', id: 88 }, unavailable: false },
      { source: { kind: 'capture', id: 3 }, unavailable: true },
      { source: { kind: 'capture', id: 99 }, unavailable: true },
    ]);
    expect(projectExploreRows(source, [], [])).toHaveLength(4);
  });

  it('resolves an event only through its explicit visit and that visit place identity', () => {
    const event: CaptureSource['events'][number] = {
      id: 7,
      tripId: 1,
      visitId: 3,
      name: 'Show',
      intention: null,
      arrangement: null,
      purchase: null,
      timing: {},
      address: null,
      reference: null,
      sourceUrl: null,
      ticketUrl: null,
      notes: 'Original note',
      sourceLinks: [],
      venueLinks: [],
      organiserLinks: [],
      documentLinks: [],
      createdAt: '',
      updatedAt: '',
    };
    const source: CaptureSource = {
      ...captureSource(),
      events: [event],
      memberships: [membership(8, { kind: 'event', id: 7 })],
    };
    expect(projectExploreRows(source, [place(2, 'Osaka')], [visit(3, 2)])).toMatchObject([
      {
        label: 'Show',
        text: 'Original note',
        location: { kind: 'place', id: 2 },
        unavailable: false,
      },
    ]);
  });
});
