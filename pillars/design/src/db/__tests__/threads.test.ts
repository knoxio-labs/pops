import { afterEach, describe, expect, it } from 'vitest';

import {
  addMessage,
  createThread,
  listThreads,
  setThreadStatus,
  type CreateThreadInput,
} from '../services/index.js';
import { openTempDesignDb, type TempDb } from './helpers.js';

const opened: TempDb[] = [];

afterEach(() => {
  while (opened.length > 0) opened.pop()?.cleanup();
});

function open(): TempDb {
  const db = openTempDesignDb();
  opened.push(db);
  return db;
}

function seed(overrides: Partial<CreateThreadInput> = {}): CreateThreadInput {
  return {
    route: '/s/finance/import-review',
    themeKey: 'light',
    viewport: '390x844',
    anchorKind: 'selector',
    anchor: '{"selector":".row"}',
    body: 'the amount column is too tight',
    author: 'operator@pops.local',
    now: '2026-01-01T00:00:01.000Z',
    ...overrides,
  };
}

describe('createThread', () => {
  it('stores the thread open, with its opening message attributed to the author', () => {
    const { db } = open();

    const id = createThread(db, seed());

    const [thread] = listThreads(db);
    expect(thread?.id).toBe(id);
    expect(thread?.status).toBe('open');
    expect(thread?.resolvedAt).toBeNull();
    expect(thread?.messages).toEqual([
      expect.objectContaining({
        author: 'operator@pops.local',
        body: 'the amount column is too tight',
      }),
    ]);
  });

  it('mints a distinct id per thread', () => {
    const { db } = open();

    const first = createThread(db, seed());
    const second = createThread(db, seed());

    expect(first).not.toBe(second);
  });
});

describe('listThreads', () => {
  it('returns threads oldest first with their own messages only', () => {
    const { db } = open();
    const first = createThread(db, seed({ now: '2026-01-01T00:00:01.000Z', body: 'first' }));
    const second = createThread(db, seed({ now: '2026-01-01T00:00:02.000Z', body: 'second' }));
    addMessage(db, {
      threadId: first,
      author: 'Claude',
      body: 'reply on first',
      now: '2026-01-01T00:00:03.000Z',
    });

    const threads = listThreads(db);

    expect(threads.map((t) => t.id)).toEqual([first, second]);
    expect(threads[0]?.messages.map((m) => m.body)).toEqual(['first', 'reply on first']);
    expect(threads[1]?.messages.map((m) => m.body)).toEqual(['second']);
  });

  it('filters by status', () => {
    const { db } = open();
    const applied = createThread(db, seed({ now: '2026-01-01T00:00:01.000Z' }));
    createThread(db, seed({ now: '2026-01-01T00:00:02.000Z' }));
    setThreadStatus(db, {
      threadId: applied,
      status: 'applied',
      resolvedBy: 'Claude',
      now: '2026-01-01T00:00:05.000Z',
    });

    expect(listThreads(db, { status: 'applied' }).map((t) => t.id)).toEqual([applied]);
    expect(listThreads(db, { status: 'open' })).toHaveLength(1);
  });

  it('filters by route', () => {
    const { db } = open();
    createThread(db, seed({ route: '/s/finance/import-review' }));
    const other = createThread(
      db,
      seed({ route: '/s/media/library', now: '2026-01-01T00:00:02.000Z' })
    );

    expect(listThreads(db, { route: '/s/media/library' }).map((t) => t.id)).toEqual([other]);
  });

  it('combines status and route, returning nothing when they disagree', () => {
    const { db } = open();
    createThread(db, seed({ route: '/s/finance/import-review' }));

    expect(listThreads(db, { route: '/s/media/library', status: 'open' })).toEqual([]);
  });

  it('since returns a thread created after the timestamp', () => {
    const { db } = open();
    createThread(db, seed({ now: '2026-01-01T00:00:01.000Z' }));
    const later = createThread(db, seed({ now: '2026-01-01T00:00:09.000Z' }));

    expect(listThreads(db, { since: '2026-01-01T00:00:05.000Z' }).map((t) => t.id)).toEqual([
      later,
    ]);
  });

  /**
   * The monitor's actual use: an old thread that just got a reply must wake
   * the watcher, or a session never learns it was answered.
   */
  it('since also returns an older thread carrying a newer message', () => {
    const { db } = open();
    const old = createThread(db, seed({ now: '2026-01-01T00:00:01.000Z' }));
    addMessage(db, {
      threadId: old,
      author: 'operator@pops.local',
      body: 'still wrong',
      now: '2026-01-01T00:00:09.000Z',
    });

    expect(listThreads(db, { since: '2026-01-01T00:00:05.000Z' }).map((t) => t.id)).toEqual([old]);
  });

  it('since excludes a thread whose only activity predates it', () => {
    const { db } = open();
    createThread(db, seed({ now: '2026-01-01T00:00:01.000Z' }));

    expect(listThreads(db, { since: '2026-01-01T00:00:05.000Z' })).toEqual([]);
  });
});

describe('addMessage', () => {
  it('appends to an existing thread', () => {
    const { db } = open();
    const id = createThread(db, seed());

    const appended = addMessage(db, {
      threadId: id,
      author: 'Claude',
      body: 'widened it',
      now: '2026-01-01T00:00:04.000Z',
    });

    expect(appended).toBe(true);
    expect(listThreads(db)[0]?.messages).toHaveLength(2);
  });

  it('refuses a thread that does not exist, writing nothing', () => {
    const { db, raw } = open();

    const appended = addMessage(db, {
      threadId: 'ghost',
      author: 'Claude',
      body: 'into the void',
      now: '2026-01-01T00:00:04.000Z',
    });

    expect(appended).toBe(false);
    expect(raw.prepare('SELECT COUNT(*) AS n FROM design_messages').get()).toEqual({ n: 0 });
  });
});

describe('setThreadStatus', () => {
  it.each(['applied', 'rejected', 'outdated'] as const)('stamps resolution for %s', (status) => {
    const { db } = open();
    const id = createThread(db, seed());

    setThreadStatus(db, {
      threadId: id,
      status,
      resolvedBy: 'Claude',
      now: '2026-01-02T00:00:00.000Z',
    });

    expect(listThreads(db)[0]).toMatchObject({
      status,
      resolvedBy: 'Claude',
      resolvedAt: '2026-01-02T00:00:00.000Z',
    });
  });

  it('clears the resolution when a thread is reopened', () => {
    const { db } = open();
    const id = createThread(db, seed());
    setThreadStatus(db, {
      threadId: id,
      status: 'applied',
      resolvedBy: 'Claude',
      now: '2026-01-02T00:00:00.000Z',
    });

    setThreadStatus(db, {
      threadId: id,
      status: 'open',
      resolvedBy: 'Claude',
      now: '2026-01-03T00:00:00.000Z',
    });

    expect(listThreads(db)[0]).toMatchObject({
      status: 'open',
      resolvedBy: null,
      resolvedAt: null,
    });
  });

  it('reports a miss for a thread that does not exist', () => {
    const { db } = open();

    expect(
      setThreadStatus(db, {
        threadId: 'ghost',
        status: 'applied',
        resolvedBy: 'Claude',
        now: '2026-01-02T00:00:00.000Z',
      })
    ).toBe(false);
  });

  /**
   * The status column carries a CHECK constraint, so a value that slipped
   * past the route validator is refused by the database rather than stored.
   */
  it('is refused by the database for a status outside the lifecycle', () => {
    const { db, raw } = open();
    const id = createThread(db, seed());

    expect(() =>
      raw.prepare('UPDATE design_threads SET status = ? WHERE id = ?').run('wontfix', id)
    ).toThrow();
  });
});

describe('cascade', () => {
  it('deletes a thread’s messages with it', () => {
    const { db, raw } = open();
    const id = createThread(db, seed());

    raw.prepare('DELETE FROM design_threads WHERE id = ?').run(id);

    expect(raw.prepare('SELECT COUNT(*) AS n FROM design_messages').get()).toEqual({ n: 0 });
  });
});
