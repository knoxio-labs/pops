/**
 * The Television's full history across three months: every kind of event a
 * person filters by, all four actors, undoable and not, so the history page
 * has months to group, chips to count and rows to open.
 */
import type { EventActor, EventKind, EventModel } from '@/kit/inventory/shared/contracts';

const ACTORS: Readonly<Record<EventActor, string>> = {
  web: 'Joao on the web',
  device: "Joao's iPhone",
  service: 'Purchases import',
  migration: 'Catalogue revision 12',
};

type Seed = [
  kind: EventKind,
  at: string,
  summary: string,
  extra?: Partial<Pick<EventModel, 'actor' | 'before' | 'after' | 'reason' | 'undoable'>>,
];

const SEEDS: readonly Seed[] = [
  [
    'field-changed',
    '2026-09-23T11:00:00Z',
    'Manufacturer changed',
    { before: 'Samsung', after: 'LG', undoable: true },
  ],
  ['connected', '2026-09-21T19:40:00Z', 'Connected to Game console', { after: 'HDMI 2' }],
  [
    'moved',
    '2026-09-20T09:12:00Z',
    'Moved to Living room',
    { before: 'Garage', after: 'Living room', actor: 'device' },
  ],
  [
    'put-back',
    '2026-09-20T09:10:00Z',
    'Put back from in hand',
    { after: 'Garage', actor: 'device' },
  ],
  ['picked-up', '2026-09-19T18:02:00Z', 'Picked up', { before: 'Garage', actor: 'device' }],
  ['photo-added', '2026-09-02T07:30:00Z', 'Photo added: Serial number label'],
  [
    'field-changed',
    '2026-08-28T20:15:00Z',
    'Replacement value recalculated',
    { before: '$2,399', after: '$2,499', actor: 'migration' },
  ],
  ['connected', '2026-08-14T10:00:00Z', 'Plugged into Living room power point 2'],
  ['connected', '2026-08-14T09:58:00Z', 'Connected to Soundbar', { after: 'HDMI eARC' }],
  ['code-set', '2026-08-02T16:20:00Z', 'Code set to TV1', { after: 'TV1' }],
  [
    'moved',
    '2026-07-30T12:00:00Z',
    'Moved to Garage',
    { before: 'Kitchen 12', after: 'Garage', actor: 'device' },
  ],
  [
    'type-set',
    '2026-07-12T08:45:00Z',
    'Type set to Electronics',
    { before: 'Untyped', after: 'Electronics' },
  ],
  [
    'field-changed',
    '2026-07-12T08:44:00Z',
    'Warranty registered set',
    { after: '14 Feb 2026, 10:12' },
  ],
  ['created', '2026-07-11T21:03:00Z', 'Created from JB Hi-Fi order 4471', { actor: 'service' }],
];

function toEvent([kind, at, summary, extra = {}]: Seed, index: number): EventModel {
  const actor = extra.actor ?? 'web';
  return {
    id: `tv-${String(index + 1).padStart(2, '0')}`,
    itemId: 'itm-tv',
    itemName: 'Television',
    kind,
    at,
    actor,
    actorName: ACTORS[actor],
    summary,
    before: extra.before ?? null,
    after: extra.after ?? null,
    reason: extra.reason ?? null,
    undoable: extra.undoable ?? false,
  };
}

/** The Television's history, newest first. */
export const televisionHistory: readonly EventModel[] = SEEDS.map(toEvent);

/** A history with nothing but its creation: the empty state. */
export const createdOnlyHistory: readonly EventModel[] = [
  {
    ...toEvent(['created', '2026-09-24T10:00:00Z', 'Created on the web'], 0),
    id: 'ladder-01',
    itemId: 'itm-ladder',
    itemName: 'Step ladder',
  },
];

/** What an inactive fixture's lifecycle event says. */
export interface LifecycleSeed {
  itemId: string;
  itemName: string;
  kind: 'retired' | 'discarded' | 'lost' | 'destroyed';
  at: string;
  reason: string;
}

const LIFECYCLE_SUMMARY: Readonly<Record<LifecycleSeed['kind'], string>> = {
  retired: 'Retired',
  discarded: 'Discarded',
  lost: 'Marked lost',
  destroyed: 'Destroyed',
};

/** One lifecycle event per inactive fixture, for its page banner. */
export function lifecycleEventFor({
  itemId,
  itemName,
  kind,
  at,
  reason,
}: LifecycleSeed): EventModel {
  const seed: Seed = [
    kind,
    at,
    LIFECYCLE_SUMMARY[kind],
    { reason, undoable: kind !== 'destroyed' },
  ];
  return { ...toEvent(seed, 0), id: `${itemId}-life`, itemId, itemName };
}
