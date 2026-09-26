import { describe, expect, it } from 'vitest';

import { EVENT_CONCEPT } from '../model/event-groups';
import { coreEvents, eventsFor } from './events';

import type { EventKind } from '../model/model';

const eventKinds: readonly EventKind[] = [
  'created',
  'moved',
  'picked-up',
  'put-back',
  'opened',
  'closed',
  'field-changed',
  'type-set',
  'code-set',
  'quantity-changed',
  'split',
  'retired',
  'discarded',
  'lost',
  'destroyed',
  'restored',
  'photo-added',
  'connected',
];

describe('event fixtures', () => {
  it('keeps the seeded events newest first', () => {
    expect(coreEvents.map((entry) => entry.id)).toEqual([
      'evt-001',
      'evt-002',
      'evt-003',
      'evt-004',
      'evt-005',
      'evt-006',
      'evt-007',
      'evt-008',
      'evt-009',
      'evt-010',
      'evt-011',
      'evt-012',
      'evt-013',
      'evt-014',
      'evt-015',
      'evt-016',
      'evt-017',
      'evt-018',
      'evt-019',
      'evt-020',
    ]);
    expect(coreEvents).toEqual(
      [...coreEvents].toSorted((left, right) => right.at.localeCompare(left.at))
    );
  });

  it('maps every authored actor to stable display names', () => {
    expect(new Map(coreEvents.map((entry) => [entry.actor, entry.actorName]))).toEqual(
      new Map([
        ['web', 'Joao on the web'],
        ['device', "Joao's iPhone"],
        ['service', 'Purchases import'],
        ['migration', 'Catalogue revision 12'],
      ])
    );
    expect(
      coreEvents
        .filter((entry) => entry.actor !== 'web')
        .map(({ id, actor, actorName }) => [id, actor, actorName])
    ).toEqual([
      ['evt-002', 'device', "Joao's iPhone"],
      ['evt-003', 'device', "Joao's iPhone"],
      ['evt-013', 'device', "Joao's iPhone"],
      ['evt-016', 'device', "Joao's iPhone"],
      ['evt-018', 'service', 'Purchases import'],
      ['evt-019', 'migration', 'Catalogue revision 12'],
    ]);
  });

  it('covers every event kind in the model', () => {
    expect(new Set(coreEvents.map((entry) => entry.kind))).toEqual(new Set(eventKinds));
    expect(new Set(eventKinds)).toEqual(new Set(Object.keys(EVENT_CONCEPT)));
  });

  it('filters one item without changing the fixture ordering or IDs', () => {
    expect(eventsFor('itm-tv').map((entry) => entry.id)).toEqual([
      'evt-006',
      'evt-016',
      'evt-017',
      'evt-020',
    ]);
    expect(eventsFor('itm-tv').every((entry) => entry.itemId === 'itm-tv')).toBe(true);
    expect(eventsFor('itm-missing')).toEqual([]);
  });
});
