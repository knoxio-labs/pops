import { and, desc, eq, gt, max, ne } from 'drizzle-orm';

import { events, type EventActorKind } from '../../db/index.js';
import { ValidationError } from '../shared/errors.js';

import type { z } from 'zod';

import type { WebChangesHeadResponseSchema } from '../../contract/rest-web-changes.js';
import type { CommandDb } from '../../domain/commands/index.js';

type WebChangesHead = z.infer<typeof WebChangesHeadResponseSchema>;
type WebChangeGroup = WebChangesHead['groups'][number];
type ChangeActorKind = Exclude<EventActorKind, 'web'>;
type ChangedEvent = {
  seq: number;
  actorKind: EventActorKind;
  actorId: string | null;
  actorLabel: string | null;
  entityId: string;
  kind: string;
  serverTime: string;
};
type NonWebEvent = Omit<ChangedEvent, 'actorKind'> & { actorKind: ChangeActorKind };

interface GroupAccumulator {
  actorKind: ChangeActorKind;
  actorId: string | null;
  actorLabel: string;
  eventCount: number;
  entityIds: Set<string>;
  kindCounts: Record<string, number>;
  latestServerTime: string;
  latestSeq: number;
}

function sourceLabel(actorKind: EventActorKind, actorLabel: string | null): string {
  return actorKind === 'device' && actorLabel ? actorLabel : 'Server';
}

function actorKey(actorKind: EventActorKind, actorId: string | null): string {
  return JSON.stringify([actorKind, actorId]);
}

function compareGroups(left: WebChangeGroup, right: WebChangeGroup): number {
  const byTime = right.latestServerTime.localeCompare(left.latestServerTime);
  if (byTime !== 0) return byTime;
  const byKind = left.actorKind.localeCompare(right.actorKind);
  if (byKind !== 0) return byKind;
  return (left.actorId ?? '').localeCompare(right.actorId ?? '');
}

function isNonWebEvent(event: ChangedEvent): event is NonWebEvent {
  return event.actorKind !== 'web';
}

function readHeadSeq(db: CommandDb): number {
  return (
    db
      .select({ headSeq: max(events.seq) })
      .from(events)
      .get()?.headSeq ?? 0
  );
}

function readChangedEvents(
  db: CommandDb,
  since: number,
  entityId: string | undefined
): ChangedEvent[] {
  return db
    .select({
      seq: events.seq,
      actorKind: events.actorKind,
      actorId: events.actorId,
      actorLabel: events.actorLabel,
      entityId: events.entityId,
      kind: events.kind,
      serverTime: events.serverTime,
    })
    .from(events)
    .where(
      and(
        gt(events.seq, since),
        ne(events.actorKind, 'web'),
        entityId === undefined ? undefined : eq(events.entityId, entityId)
      )
    )
    .orderBy(desc(events.serverTime), desc(events.seq))
    .all();
}

function newGroup(event: NonWebEvent): GroupAccumulator {
  return {
    actorKind: event.actorKind,
    actorId: event.actorId,
    actorLabel: sourceLabel(event.actorKind, event.actorLabel),
    eventCount: 0,
    entityIds: new Set<string>(),
    kindCounts: {},
    latestServerTime: event.serverTime,
    latestSeq: event.seq,
  };
}

function addEvent(group: GroupAccumulator, event: NonWebEvent): void {
  group.eventCount += 1;
  group.entityIds.add(event.entityId);
  group.kindCounts[event.kind] = (group.kindCounts[event.kind] ?? 0) + 1;
  if (
    event.serverTime > group.latestServerTime ||
    (event.serverTime === group.latestServerTime && event.seq > group.latestSeq)
  ) {
    group.actorLabel = sourceLabel(event.actorKind, event.actorLabel);
    group.latestServerTime = event.serverTime;
    group.latestSeq = event.seq;
  }
}

function groupChangedEvents(changedEvents: readonly ChangedEvent[]): WebChangeGroup[] {
  const groups = new Map<string, GroupAccumulator>();
  for (const event of changedEvents) {
    if (!isNonWebEvent(event)) continue;
    const key = actorKey(event.actorKind, event.actorId);
    const group = groups.get(key) ?? newGroup(event);
    addEvent(group, event);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group): WebChangeGroup => ({
      actorKind: group.actorKind,
      actorId: group.actorId,
      actorLabel: group.actorLabel,
      eventCount: group.eventCount,
      entityCount: group.entityIds.size,
      kindCounts: group.kindCounts,
      latestServerTime: group.latestServerTime,
    }))
    .toSorted(compareGroups);
}

/** Read the inventory change head and grouped non-web changes after a cursor. */
export function readChangesHead(
  db: CommandDb,
  query: { since?: number; entityId?: string }
): WebChangesHead {
  const headSeq = readHeadSeq(db);
  if (query.since === undefined) return { headSeq, groups: [] };
  if (query.since > headSeq) throw new ValidationError('since is ahead of the head');
  return {
    headSeq,
    groups: groupChangedEvents(readChangedEvents(db, query.since, query.entityId)),
  };
}
