import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InventoryApiError } from '../inventory-api-helpers.js';

const mocks = vi.hoisted(() => ({ syncMutations: vi.fn() }));

vi.mock('../inventory-api/index.js', () => ({
  syncMutations: (...args: unknown[]) => mocks.syncMutations(...args),
}));

import {
  buildMutationEnvelope,
  INVENTORY_SYNC_PROTOCOL,
  sendInventoryMutation,
} from './mutation-client';

import type { InventoryCommand } from './commands';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildMutationEnvelope', () => {
  it('shapes item.move exactly as the command-vectors fixture does', () => {
    const command: InventoryCommand = {
      op: 'item.move',
      args: { to: { kind: 'location', locationId: 'loc-1' }, verb: 'move' },
    };
    const envelope = buildMutationEnvelope({
      command,
      entityId: 'item-1',
      baseRevision: 1,
      mutationId: '30000000-0000-4000-8000-000000000001',
      clientTime: '2026-09-19T00:00:00.000Z',
    });
    expect(envelope).toEqual({
      mutationId: '30000000-0000-4000-8000-000000000001',
      op: 'item.move',
      entityId: 'item-1',
      baseRevision: 1,
      dependsOn: [],
      clientTime: '2026-09-19T00:00:00.000Z',
      args: { to: { kind: 'location', locationId: 'loc-1' }, verb: 'move' },
    });
  });

  it('shapes item.create with no baseRevision, matching the fixture (create has none)', () => {
    const command: InventoryCommand = {
      op: 'item.create',
      args: { item: { name: 'Lamp', placement: { kind: 'hand' } } },
    };
    const envelope = buildMutationEnvelope({
      command,
      entityId: 'item-new',
      mutationId: '30000000-0000-4000-8000-000000000007',
      clientTime: '2026-09-19T00:00:00.000Z',
    });
    expect(envelope.baseRevision).toBeNull();
    expect(envelope.dependsOn).toEqual([]);
    expect(envelope.op).toBe('item.create');
    expect(envelope.args).toEqual({ item: { name: 'Lamp', placement: { kind: 'hand' } } });
  });

  it('carries dependsOn through untouched', () => {
    const command: InventoryCommand = { op: 'item.delete', args: {} };
    const envelope = buildMutationEnvelope({
      command,
      entityId: 'item-2',
      dependsOn: ['30000000-0000-4000-8000-000000000001'],
    });
    expect(envelope.dependsOn).toEqual(['30000000-0000-4000-8000-000000000001']);
  });

  it('mints a fresh UUID mutationId and clientTime when neither is supplied', () => {
    const a = buildMutationEnvelope({ command: { op: 'item.delete', args: {} }, entityId: 'x' });
    const b = buildMutationEnvelope({ command: { op: 'item.delete', args: {} }, entityId: 'x' });
    expect(a.mutationId).not.toBe(b.mutationId);
    expect(() => new Date(a.clientTime).toISOString()).not.toThrow();
  });
});

describe('sendInventoryMutation', () => {
  function ok(outcomes: unknown[]) {
    return { data: { outcomes, highWaterSeq: 42 }, error: undefined, response: { status: 200 } };
  }

  it('sends a one-mutation batch with the protocol header and returns its outcome', async () => {
    mocks.syncMutations.mockResolvedValue(
      ok([{ mutationId: 'm1', status: 'applied', revision: 2, seq: 1, converged: false }])
    );
    const outcome = await sendInventoryMutation({
      command: { op: 'item.setFull', args: { full: true } },
      entityId: 'item-1',
      baseRevision: 1,
      mutationId: 'm1',
    });
    expect(outcome).toEqual({
      mutationId: 'm1',
      status: 'applied',
      revision: 2,
      seq: 1,
      converged: false,
    });
    expect(mocks.syncMutations).toHaveBeenCalledTimes(1);
    const call = mocks.syncMutations.mock.calls[0]?.[0];
    expect(call?.headers).toEqual({ 'pops-inventory-protocol': INVENTORY_SYNC_PROTOCOL });
    expect(call?.body.mutations).toHaveLength(1);
    expect(call?.body.mutations[0]).toMatchObject({ op: 'item.setFull', entityId: 'item-1' });
  });

  it('surfaces a conflict outcome as data, not as a thrown error', async () => {
    mocks.syncMutations.mockResolvedValue(
      ok([
        {
          mutationId: 'm1',
          status: 'conflict',
          kind: 'field',
          field: 'name',
          mine: 'a',
          theirs: 'b',
          at: '2026-09-19T00:00:00.000Z',
          currentRevision: 3,
          source: { kind: 'web', label: 'Web' },
        },
      ])
    );
    const outcome = await sendInventoryMutation({
      command: { op: 'item.edit', args: { name: 'a' } },
      entityId: 'item-1',
      baseRevision: 1,
    });
    expect(outcome.status).toBe('conflict');
  });

  it('throws InventoryApiError on a 426 (protocol too old)', async () => {
    mocks.syncMutations.mockResolvedValue({
      data: undefined,
      error: { message: 'client too old' },
      response: { status: 426 },
    });
    await expect(
      sendInventoryMutation({ command: { op: 'item.delete', args: {} }, entityId: 'item-1' })
    ).rejects.toMatchObject({ status: 426 });
  });

  it('throws InventoryApiError when the response carries no outcome at all', async () => {
    mocks.syncMutations.mockResolvedValue({
      data: { outcomes: [], highWaterSeq: 0 },
      error: undefined,
      response: { status: 200 },
    });
    await expect(
      sendInventoryMutation({ command: { op: 'item.delete', args: {} }, entityId: 'item-1' })
    ).rejects.toBeInstanceOf(InventoryApiError);
  });
});
