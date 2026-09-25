/**
 * History events for the named fixtures: every event kind at least once,
 * across all four actors, spanning two months so month grouping has
 * something to group, with one undoable event per reversible kind.
 */
import { placementEventSeeds } from './events-placement';
import { recordEventSeeds } from './events-record';

import type { EventActor, EventModel } from '@/kit/inventory/shared/model';

import type { EventSeed } from './event-seed';

const ACTOR_NAMES: Record<EventActor, string> = {
  web: 'Joao on the web',
  device: "Joao's iPhone",
  service: 'Purchases import',
  migration: 'Catalogue revision 12',
};

function event(seed: EventSeed, index: number): EventModel {
  const actor = seed.actor ?? 'web';
  return {
    id: `evt-${String(index + 1).padStart(3, '0')}`,
    itemId: seed.itemId,
    itemName: seed.itemName,
    kind: seed.kind,
    at: seed.at,
    actor,
    actorName: ACTOR_NAMES[actor],
    summary: seed.summary,
    before: seed.before ?? null,
    after: seed.after ?? null,
    reason: seed.reason ?? null,
    undoable: seed.undoable ?? false,
  };
}

const SEEDS: readonly EventSeed[] = [...placementEventSeeds, ...recordEventSeeds].toSorted((a, b) =>
  b.at.localeCompare(a.at)
);

/** Every seeded event, newest first. */
export const coreEvents: readonly EventModel[] = SEEDS.map(event);

/** The events of one item, newest first. */
export function eventsFor(itemId: string): EventModel[] {
  return coreEvents.filter((entry) => entry.itemId === itemId);
}
