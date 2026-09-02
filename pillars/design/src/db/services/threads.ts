/**
 * Reads and writes over the comment tables.
 *
 * Everything here takes an explicit `now` and `id` supplier rather than
 * calling `Date.now`/`randomUUID` inline, so a test asserting ordering or
 * identity does not have to sleep or match a regex.
 */
import { randomUUID } from 'node:crypto';

import { and, asc, eq, gt, inArray, or, sql } from 'drizzle-orm';

import { designMessages, designThreads } from '../schema.js';
import { isResolvedStatus, type ThreadStatus } from './thread-status.js';

import type { DesignDb } from '../open-design-db.js';

export interface ThreadMessageRow {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface ThreadRow {
  id: string;
  route: string;
  themeKey: string;
  viewport: string;
  anchorKind: string;
  anchor: string;
  status: string;
  createdBy: string;
  createdAt: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  messages: ThreadMessageRow[];
}

export interface ListThreadsFilter {
  status?: ThreadStatus;
  route?: string;
  /** ISO timestamp: a thread created after it, or carrying a message after it. */
  since?: string;
}

/**
 * List threads with their messages nested, oldest first.
 *
 * `since` deliberately matches on message activity as well as thread
 * creation: the monitor's whole job is to notice a reply on a thread it has
 * already seen, and a created-at-only filter would never wake for one.
 */
export function listThreads(db: DesignDb, filter: ListThreadsFilter = {}): ThreadRow[] {
  const conditions = [];
  if (filter.status !== undefined) conditions.push(eq(designThreads.status, filter.status));
  if (filter.route !== undefined) conditions.push(eq(designThreads.route, filter.route));
  if (filter.since !== undefined) {
    const recentlyMessaged = db
      .select({ id: designMessages.threadId })
      .from(designMessages)
      .where(gt(designMessages.createdAt, filter.since));
    conditions.push(
      or(gt(designThreads.createdAt, filter.since), inArray(designThreads.id, recentlyMessaged)) ??
        sql`1 = 1`
    );
  }

  const threads = db
    .select()
    .from(designThreads)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(designThreads.createdAt))
    .all();

  const byThread = messagesFor(
    db,
    threads.map((thread) => thread.id)
  );
  return threads.map((thread) => ({ ...thread, messages: byThread.get(thread.id) ?? [] }));
}

function messagesFor(db: DesignDb, threadIds: string[]): Map<string, ThreadMessageRow[]> {
  const grouped = new Map<string, ThreadMessageRow[]>();
  if (threadIds.length === 0) return grouped;
  const rows = db
    .select()
    .from(designMessages)
    .where(inArray(designMessages.threadId, threadIds))
    .orderBy(asc(designMessages.createdAt))
    .all();
  for (const row of rows) {
    const existing = grouped.get(row.threadId);
    const message: ThreadMessageRow = {
      id: row.id,
      author: row.author,
      body: row.body,
      createdAt: row.createdAt,
    };
    if (existing) existing.push(message);
    else grouped.set(row.threadId, [message]);
  }
  return grouped;
}

export interface CreateThreadInput {
  route: string;
  themeKey: string;
  viewport: string;
  anchorKind: string;
  anchor: string;
  body: string;
  author: string;
  now: string;
}

/**
 * Create a thread and its opening message in one transaction — a thread with
 * no message is a row the overlay renders as an empty bubble, so the two
 * inserts are never allowed to land apart.
 */
export function createThread(db: DesignDb, input: CreateThreadInput): string {
  const id = randomUUID();
  db.transaction((tx) => {
    tx.insert(designThreads)
      .values({
        id,
        route: input.route,
        themeKey: input.themeKey,
        viewport: input.viewport,
        anchorKind: input.anchorKind,
        anchor: input.anchor,
        status: 'open',
        createdBy: input.author,
        createdAt: input.now,
      })
      .run();
    tx.insert(designMessages)
      .values({
        id: randomUUID(),
        threadId: id,
        author: input.author,
        body: input.body,
        createdAt: input.now,
      })
      .run();
  });
  return id;
}

export interface AddMessageInput {
  threadId: string;
  author: string;
  body: string;
  now: string;
}

/** Append a message. Returns false when the thread does not exist. */
export function addMessage(db: DesignDb, input: AddMessageInput): boolean {
  const thread = db
    .select({ id: designThreads.id })
    .from(designThreads)
    .where(eq(designThreads.id, input.threadId))
    .get();
  if (!thread) return false;
  db.insert(designMessages)
    .values({
      id: randomUUID(),
      threadId: input.threadId,
      author: input.author,
      body: input.body,
      createdAt: input.now,
    })
    .run();
  return true;
}

export interface SetStatusInput {
  threadId: string;
  status: ThreadStatus;
  resolvedBy: string;
  now: string;
}

/** Set a thread's status. Returns false when the thread does not exist. */
export function setThreadStatus(db: DesignDb, input: SetStatusInput): boolean {
  const result = db
    .update(designThreads)
    .set({
      status: input.status,
      resolvedBy: isResolvedStatus(input.status) ? input.resolvedBy : null,
      resolvedAt: isResolvedStatus(input.status) ? input.now : null,
    })
    .where(eq(designThreads.id, input.threadId))
    .run();
  return result.changes > 0;
}
