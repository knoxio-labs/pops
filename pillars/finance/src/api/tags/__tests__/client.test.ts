import { describe, expect, it, vi } from 'vitest';

import {
  type CallDynamicFn,
  type CallResult,
  type CallableProcedure,
  type PillarHandle,
} from '@pops/pillar-sdk/client';

import { createTagsClient, type TagsRouter } from '../client.js';

import type { CreateSharedTagInput, SharedTag, TagsListQuery, TagsListResponse } from '../wire.js';

const TAG: SharedTag = {
  id: 'f93f4e8d-72c5-4be6-b68e-9fd1d39d9aa4',
  facet: 'trip',
  name: 'Weekend away',
  parentId: null,
  description: null,
  window: null,
  archived: false,
  archivedAt: null,
  mergedIntoId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function ok<T>(value: T): CallResult<T> {
  return { kind: 'ok', value };
}

function proc<Args extends readonly unknown[], Output>(
  fn: (...args: Args) => Promise<CallResult<Output>>
): CallableProcedure<Args, Output> {
  const orThrow = async (...args: Args): Promise<Output> => {
    const result = await fn(...args);
    if (result.kind !== 'ok') throw new Error(`stub orThrow: ${result.kind}`);
    return result.value;
  };
  return Object.assign(fn, { orThrow });
}

const callDynamic: CallDynamicFn = () => {
  throw new Error('callDynamic is not used by the tags client');
};

interface StubOperations {
  list: (input: TagsListQuery) => Promise<CallResult<TagsListResponse>>;
  create: (input: CreateSharedTagInput) => Promise<CallResult<SharedTag>>;
}

function unexpected(operation: string): never {
  throw new Error(`stub ${operation} called unexpectedly`);
}

function stubHandle(impls: Partial<StubOperations>): PillarHandle<TagsRouter> {
  return {
    tags: {
      list: proc(impls.list ?? (() => unexpected('tags.list'))),
      create: proc(impls.create ?? (() => unexpected('tags.create'))),
    },
    callDynamic,
  };
}

describe('createTagsClient.list', () => {
  it('parses tags and passes list filters as flat arguments', async () => {
    const list = vi.fn(async (_input: TagsListQuery) => ok({ tags: [TAG] }));
    const filters = {
      facet: 'trip',
      includeArchived: 'true' as const,
      updatedSince: '2026-01-01T00:00:00.000Z',
    };
    const client = createTagsClient(() => stubHandle({ list }));

    await expect(client.list(filters)).resolves.toEqual({ kind: 'ok', value: [TAG] });
    expect(list).toHaveBeenCalledWith(filters);
    expect(list.mock.calls[0]?.[0]).not.toHaveProperty('query');
  });

  it('keeps unavailable distinct from a valid empty vocabulary', async () => {
    const list = vi.fn(async () => ({ kind: 'unavailable', pillar: 'tags' }) as const);
    const client = createTagsClient(() => stubHandle({ list }));

    await expect(client.list()).resolves.toEqual({ kind: 'unavailable', pillar: 'tags' });
  });

  it('keeps an unauthorized result distinct from an empty vocabulary', async () => {
    const list = vi.fn(async () => ({ kind: 'unauthorized', pillar: 'tags' }) as const);
    const client = createTagsClient(() => stubHandle({ list }));

    await expect(client.list()).resolves.toEqual({ kind: 'unauthorized', pillar: 'tags' });
  });

  it('reports a malformed response as contract-mismatch instead of an empty list', async () => {
    const list = vi.fn(async () => ok({ tags: 'not-an-array' } as unknown as TagsListResponse));
    const client = createTagsClient(() => stubHandle({ list }));

    const result = await client.list();

    expect(result).toMatchObject({ kind: 'contract-mismatch', pillar: 'tags' });
    expect(result).not.toEqual({ kind: 'ok', value: [] });
  });

  it('reports a missing key as no-credential, not as an empty list', async () => {
    const client = createTagsClient(() => null);

    await expect(client.list()).resolves.toEqual({
      kind: 'no-credential',
      reason: 'no-credential',
    });
  });
});

describe('createTagsClient.create', () => {
  it('parses the created tag and passes the flat body to the SDK', async () => {
    const create = vi.fn(async (_input: CreateSharedTagInput) => ok(TAG));
    const input: CreateSharedTagInput = { facet: 'trip', name: 'Weekend away' };
    const client = createTagsClient(() => stubHandle({ create }));

    await expect(client.create(input)).resolves.toEqual({ kind: 'ok', value: TAG });
    expect(create).toHaveBeenCalledWith(input);
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('body');
  });

  it('reports a malformed created tag as contract-mismatch', async () => {
    const create = vi.fn(async () => ok({ id: 'bad' } as unknown as SharedTag));
    const client = createTagsClient(() => stubHandle({ create }));

    await expect(client.create({ facet: 'trip', name: 'Weekend away' })).resolves.toMatchObject({
      kind: 'contract-mismatch',
      pillar: 'tags',
    });
  });
});
