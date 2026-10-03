import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openFinanceDb, type OpenedFinanceDb } from '../../../db/open-finance-db.js';
import { tagVocabulary } from '../../../db/schema.js';
import { NO_CREDENTIAL_REASON } from '../../pillars/outbound.js';
import { startSyncSharedTagsWorker, type SharedTagSyncHandle } from '../sync-shared-tags.js';

import type { TagsClient } from '../../tags/client.js';
import type { SharedTag, TagsListQuery } from '../../tags/wire.js';

let directory: string;
let opened: OpenedFinanceDb;
let handle: SharedTagSyncHandle | undefined;

function id(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}

function sharedTag(
  idNumber: number,
  facet: string,
  name: string,
  overrides: Partial<SharedTag> = {}
): SharedTag {
  return {
    id: id(idNumber),
    facet,
    name,
    parentId: null,
    description: null,
    window: null,
    archived: false,
    archivedAt: null,
    mergedIntoId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function seedLocal(
  tag: string,
  options: { sharedTagId?: string; isActive?: boolean; usageCount?: number } = {}
): void {
  opened.db
    .insert(tagVocabulary)
    .values({
      tag,
      facet: tag.slice(0, tag.indexOf(':')),
      kind: 'open',
      source: 'seed',
      isActive: options.isActive ?? true,
      usageCount: options.usageCount ?? 0,
      ...(options.sharedTagId === undefined ? {} : { sharedTagId: options.sharedTagId }),
    })
    .run();
}

function allRows() {
  return opened.db.select().from(tagVocabulary).orderBy(tagVocabulary.tag).all();
}

function makeClient(
  tags: SharedTag[],
  create?: TagsClient['create']
): { client: TagsClient; list: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> } {
  let nextId = 100;
  const list = vi.fn(async (query: TagsListQuery = {}) => ({
    kind: 'ok' as const,
    value: tags.filter((tag) => tag.facet === query.facet),
  }));
  const createCall = vi.fn(
    create ??
      (async (input) => ({
        kind: 'ok' as const,
        value: sharedTag(nextId++, input.facet, input.name),
      }))
  );
  return { client: { list, create: createCall }, list, create: createCall };
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'finance-shared-tags-worker-'));
  opened = openFinanceDb(join(directory, 'finance.db'));
  opened.db.delete(tagVocabulary).run();
});

afterEach(async () => {
  await handle?.stop();
  handle = undefined;
  vi.useRealTimers();
  opened.raw.close();
  rmSync(directory, { recursive: true, force: true });
});

describe('startSyncSharedTagsWorker', () => {
  it('links the seeded trip and hobby values and makes no create calls on the next pass', async () => {
    const tags = [
      ['trip:cairns-2026', 'trip', 'Cairns 2026'],
      ['trip:hunter-valley-2026', 'trip', 'Hunter Valley 2026'],
      ['hobby:crypto', 'hobby', 'Crypto'],
      ['hobby:hiking', 'hobby', 'Hiking'],
      ['hobby:reading', 'hobby', 'Reading'],
      ['hobby:gardening', 'hobby', 'Gardening'],
      ['hobby:photography', 'hobby', 'Photography'],
    ] as const;
    for (const [index, [localTag]] of tags.entries()) {
      seedLocal(localTag, { usageCount: index + 3 });
    }
    const remote = tags.map(([, facet, name], index) => sharedTag(index + 1, facet, name));
    const { client, list, create } = makeClient(remote);
    handle = startSyncSharedTagsWorker({ db: opened.db, client, intervalMs: 60_000 });

    await handle.runOnce();
    const linked = allRows();
    await handle.runOnce();

    expect(list).toHaveBeenCalledTimes(6);
    expect(list.mock.calls.slice(0, 3).map(([query]) => query)).toEqual([
      { facet: 'trip', includeArchived: 'true' },
      { facet: 'hobby', includeArchived: 'true' },
      { facet: 'project', includeArchived: 'true' },
    ]);
    expect(create).not.toHaveBeenCalled();
    expect(allRows()).toEqual(linked);
    expect(allRows().map((row) => row.sharedTagId)).not.toContain(null);
    expect(Object.fromEntries(allRows().map((row) => [row.tag, row.usageCount]))).toEqual(
      Object.fromEntries(tags.map(([localTag], index) => [localTag, index + 3]))
    );
  });

  it('creates local rows for pulled values and preserves local keys across remote renames', async () => {
    const brazil = sharedTag(10, 'trip', 'Brazil 2027');
    seedLocal('trip:old-brazil-name', { sharedTagId: id(11), usageCount: 9 });
    const renamed = sharedTag(11, 'trip', 'Brazil Adventure 2027');
    const { client } = makeClient([brazil, renamed]);
    handle = startSyncSharedTagsWorker({ db: opened.db, client });

    await handle.runOnce();

    expect(
      opened.db.select().from(tagVocabulary).where(eq(tagVocabulary.tag, 'trip:brazil-2027')).get()
    ).toMatchObject({ sharedTagId: id(10), usageCount: 0, source: 'user' });
    expect(
      opened.db
        .select()
        .from(tagVocabulary)
        .where(eq(tagVocabulary.tag, 'trip:old-brazil-name'))
        .get()
    ).toMatchObject({ sharedTagId: id(11), usageCount: 9 });
    expect(allRows()).toHaveLength(2);
  });

  it('deactivates archived unmerged tags without changing usage or local strings', async () => {
    seedLocal('trip:cairns-2026', { sharedTagId: id(20), usageCount: 6 });
    const retired = sharedTag(20, 'trip', 'Cairns Replaced', { archived: true });
    const { client } = makeClient([retired]);
    handle = startSyncSharedTagsWorker({ db: opened.db, client });

    await handle.runOnce();

    expect(allRows()).toMatchObject([
      { tag: 'trip:cairns-2026', sharedTagId: id(20), isActive: false, usageCount: 6 },
    ]);
  });

  it('leaves the database untouched and logs once while tags is unavailable', async () => {
    seedLocal('trip:local-only', { usageCount: 8 });
    const before = allRows();
    const warn = vi.fn();
    const client: TagsClient = {
      list: vi.fn(async () => ({ kind: 'unavailable' as const, pillar: 'tags' })),
      create: vi.fn(),
    };
    handle = startSyncSharedTagsWorker({ db: opened.db, client, logger: { warn } });

    await handle.runOnce();
    await handle.runOnce();

    expect(allRows()).toEqual(before);
    expect(client.create).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does not partially apply pulled tags if a create call loses the tags service', async () => {
    const remote = sharedTag(30, 'trip', 'Brazil 2027');
    seedLocal('hobby:crypto', { usageCount: 3 });
    const before = allRows();
    const { client } = makeClient([remote], async () => ({
      kind: 'no-credential',
      reason: NO_CREDENTIAL_REASON,
    }));
    handle = startSyncSharedTagsWorker({ db: opened.db, client });

    await handle.runOnce();

    expect(allRows()).toEqual(before);
  });

  it('reports a create-or-get id already linked to another local value without writing it', async () => {
    const existing = sharedTag(40, 'hobby', 'Crypto');
    seedLocal('hobby:crypto', { sharedTagId: existing.id, usageCount: 14 });
    seedLocal('hobby:cryptocurrency', { usageCount: 5 });
    const warn = vi.fn();
    const { client, create } = makeClient([existing], async () => ({
      kind: 'ok',
      value: existing,
    }));
    handle = startSyncSharedTagsWorker({ db: opened.db, client, logger: { warn } });

    await handle.runOnce();

    expect(create).toHaveBeenCalledWith({ facet: 'hobby', name: 'cryptocurrency' });
    expect(
      opened.db
        .select()
        .from(tagVocabulary)
        .where(eq(tagVocabulary.tag, 'hobby:cryptocurrency'))
        .get()
    ).toMatchObject({ sharedTagId: null, usageCount: 5 });
    expect(warn).toHaveBeenCalledWith('finance shared-tag link conflict', {
      conflict: `shared-id: hobby:crypto`,
    });
  });

  it('runs immediately, repeats on its interval, and drains on stop', async () => {
    vi.useFakeTimers();
    const { client, list } = makeClient([]);
    handle = startSyncSharedTagsWorker({ db: opened.db, client, intervalMs: 1_000 });

    await handle.runOnce();
    expect(list).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(list).toHaveBeenCalledTimes(6);
    await handle.stop();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(list).toHaveBeenCalledTimes(6);
  });
});
