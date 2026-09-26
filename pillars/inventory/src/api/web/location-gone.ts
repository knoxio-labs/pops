import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';

import { WebLocationGoneResponseSchema } from '../../contract/rest-web-locations.js';
import { events, items, locations } from '../../db/index.js';
import { sourceOf, toDomainEvent } from '../../domain/commands/events.js';

import type { z } from 'zod';

import type { CommandDb } from '../../domain/commands/index.js';

/** The wire shape returned for a tombstoned location. */
export type WebLocationGone = z.infer<typeof WebLocationGoneResponseSchema>;

/**
 * Read a deleted location's identity, deletion provenance, and loose-item count.
 * Live and unknown locations return `null`; items count only while their last
 * known placement is the deleted location and they remain active.
 */
export function readLocationGone(db: CommandDb, id: string): WebLocationGone | null {
  const location = db
    .select({ id: locations.id, name: locations.name, deletedAt: locations.deletedAt })
    .from(locations)
    .where(and(eq(locations.id, id), isNotNull(locations.deletedAt)))
    .get();
  if (location === undefined || location.deletedAt === null) return null;

  const deletedEvent = db
    .select()
    .from(events)
    .where(
      and(eq(events.entityKind, 'location'), eq(events.entityId, id), eq(events.kind, 'deleted'))
    )
    .orderBy(desc(events.seq))
    .limit(1)
    .get();

  const inHandCount =
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(items)
      .where(
        and(
          isNull(items.deletedAt),
          eq(items.lifecycle, 'active'),
          eq(items.placementKind, 'hand'),
          eq(items.previousPlacementKind, 'location'),
          eq(items.previousLocationId, id)
        )
      )
      .get()?.count ?? 0;

  return WebLocationGoneResponseSchema.parse({
    id: location.id,
    name: location.name,
    deletedAt: location.deletedAt,
    deletedBy: deletedEvent === undefined ? null : sourceOf(toDomainEvent(deletedEvent)),
    inHandCount,
  });
}
