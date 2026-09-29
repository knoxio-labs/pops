import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_MUTATION_BATCH } from '@pops/inventory';

import {
  RELOAD_REQUIRED_REASON,
  reloadRequired,
  resetInterruption,
} from '../foundation/interruptions/interruption-store.js';
import { InventoryApiError } from '../inventory-api-helpers.js';
import { optimisticItemsFor } from './optimistic-items.js';

const mocks = vi.hoisted(() => ({ syncMutations: vi.fn() }));

vi.mock('../inventory-api/index.js', () => ({
  syncMutations: (...args: unknown[]) => mocks.syncMutations(...args),
}));

import {
  buildMutationEnvelope,
  createUndo,
  sendInventoryMutations,
  sendInventoryMutation,
  UndoRefusedError,
} from './mutation-client';

import type { InventoryCommand, InventoryPlacementTarget } from './commands';

beforeEach(() => {
  resetInterruption();
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

  it('carries catalogueRevision for protocol-2 values and omits it for unchanged commands', () => {
    const target: InventoryPlacementTarget = { kind: 'hand' };
    const typedEdit = buildMutationEnvelope({
      command: {
        op: 'item.edit',
        args: { values: [{ fieldId: 'field-name', values: ['Lamp'] }] },
      },
      entityId: 'item-1',
      catalogueRevision: 7,
      mutationId: '30000000-0000-4000-8000-000000000008',
      clientTime: '2026-09-19T00:00:00.000Z',
    });
    const typedOverride = buildMutationEnvelope({
      command: {
        op: 'item.setOverride',
        args: { fieldId: 'field-label', values: [{ optionId: 'label-a' }] },
      },
      entityId: 'item-1',
      catalogueRevision: 7,
      mutationId: '30000000-0000-4000-8000-000000000009',
      clientTime: '2026-09-19T00:00:00.000Z',
    });
    const typedChange = buildMutationEnvelope({
      command: { op: 'item.changeType', args: { typeId: 'type-cable', values: [] } },
      entityId: 'item-1',
      catalogueRevision: 7,
      mutationId: '30000000-0000-4000-8000-000000000010',
      clientTime: '2026-09-19T00:00:00.000Z',
    });
    const untyped = buildMutationEnvelope({
      command: { op: 'item.move', args: { to: target, verb: 'move' } },
      entityId: 'item-1',
      mutationId: '30000000-0000-4000-8000-000000000011',
      clientTime: '2026-09-19T00:00:00.000Z',
    });
    const revert = buildMutationEnvelope({
      command: { op: 'event.revert', args: { seq: 12 } },
      entityId: 'item-1',
      mutationId: '30000000-0000-4000-8000-000000000012',
      clientTime: '2026-09-19T00:00:00.000Z',
    });

    expect(typedEdit.catalogueRevision).toBe(7);
    expect(typedOverride.catalogueRevision).toBe(7);
    expect(typedChange.catalogueRevision).toBe(7);
    expect(untyped).not.toHaveProperty('catalogueRevision');
    expect(revert).not.toHaveProperty('catalogueRevision');
  });
});

describe('sendInventoryMutation', () => {
  function ok(outcomes: unknown[]) {
    return {
      data: { outcomes, highWaterSeq: 42 },
      error: undefined,
      response: { status: 200, url: '/inventory-api/sync/mutations' },
    };
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
    expect(call?.headers).toEqual({ 'pops-inventory-protocol': '3' });
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

  it('throws ApiError on a 426 (protocol too old)', async () => {
    mocks.syncMutations.mockResolvedValue({
      data: undefined,
      error: { message: 'client too old' },
      response: { status: 426, url: '/inventory-api/sync/mutations' },
    });
    await expect(
      sendInventoryMutation({ command: { op: 'item.delete', args: {} }, entityId: 'item-1' })
    ).rejects.toBeInstanceOf(InventoryApiError);
    expect(reloadRequired()).toBe(true);
  });

  it('a 426 from sendInventoryMutations reports reload-required and still throws InventoryApiError', async () => {
    mocks.syncMutations.mockResolvedValue({
      data: undefined,
      error: { message: 'client too old' },
      response: { status: 426, url: '/inventory-api/sync/mutations' },
    });

    await expect(
      sendInventoryMutations([{ command: { op: 'item.delete', args: {} }, entityId: 'item-1' }])
    ).rejects.toBeInstanceOf(InventoryApiError);
    expect(reloadRequired()).toBe(true);
  });

  it('after a 426 both senders throw RELOAD_REQUIRED_REASON without calling syncMutations', async () => {
    mocks.syncMutations.mockResolvedValue({
      data: undefined,
      error: { message: 'client too old' },
      response: { status: 426, url: '/inventory-api/sync/mutations' },
    });
    const input = { command: { op: 'item.delete', args: {} }, entityId: 'item-1' } as const;

    await expect(sendInventoryMutation(input)).rejects.toBeInstanceOf(InventoryApiError);
    expect(reloadRequired()).toBe(true);
    mocks.syncMutations.mockClear();

    await expect(sendInventoryMutation(input)).rejects.toMatchObject({
      message: RELOAD_REQUIRED_REASON,
      status: 426,
    });
    await expect(sendInventoryMutations([input])).rejects.toMatchObject({
      message: RELOAD_REQUIRED_REASON,
      status: 426,
    });
    expect(mocks.syncMutations).not.toHaveBeenCalled();
  });

  it.each([403, 500])('a %s leaves the next send going out', async (status) => {
    mocks.syncMutations
      .mockResolvedValueOnce({
        data: undefined,
        error: { message: 'request failed' },
        response: { status, url: '/inventory-api/sync/mutations' },
      })
      .mockResolvedValueOnce(
        ok([{ mutationId: 'm1', status: 'applied', revision: 2, seq: 1, converged: false }])
      );
    const input = {
      command: { op: 'item.delete', args: {} },
      entityId: 'item-1',
      mutationId: 'm1',
    } as const;

    await expect(sendInventoryMutation(input)).rejects.toMatchObject({ status });
    await expect(sendInventoryMutation(input)).resolves.toMatchObject({ status: 'applied' });

    expect(mocks.syncMutations).toHaveBeenCalledTimes(2);
    expect(reloadRequired()).toBe(false);
  });

  it('throws ApiError when the response carries no outcome at all', async () => {
    mocks.syncMutations.mockResolvedValue({
      data: { outcomes: [], highWaterSeq: 0 },
      error: undefined,
      response: { status: 200 },
    });
    await expect(
      sendInventoryMutation({ command: { op: 'item.delete', args: {} }, entityId: 'item-1' })
    ).rejects.toBeInstanceOf(InventoryApiError);
  });

  it('sends one batch and returns outcomes in input order', async () => {
    mocks.syncMutations.mockResolvedValue(
      ok([
        { mutationId: 'm1', status: 'deferred', waitingOn: 'm2' },
        { mutationId: 'm2', status: 'applied', revision: 3, seq: 12, converged: false },
      ])
    );
    const inputs = [
      {
        command: { op: 'item.setFull', args: { full: true } },
        entityId: 'item-1',
        mutationId: 'm1',
        clientTime: '2026-09-19T00:00:00.000Z',
      },
      {
        command: { op: 'item.setAccess', args: { access: 'open' } },
        entityId: 'item-2',
        mutationId: 'm2',
        clientTime: '2026-09-19T00:00:00.000Z',
      },
    ] as const;

    await expect(sendInventoryMutations(inputs)).resolves.toEqual([
      { mutationId: 'm1', status: 'deferred', waitingOn: 'm2' },
      { mutationId: 'm2', status: 'applied', revision: 3, seq: 12, converged: false },
    ]);
    expect(mocks.syncMutations).toHaveBeenCalledTimes(1);
    expect(mocks.syncMutations.mock.calls[0]?.[0].body.mutations).toHaveLength(2);
  });

  it('refuses empty or over-capacity batches without sending', async () => {
    const input = {
      command: { op: 'item.delete', args: {} },
      entityId: 'item-1',
    } as const;

    await expect(sendInventoryMutations([])).rejects.toBeInstanceOf(RangeError);
    await expect(
      sendInventoryMutations(Array.from({ length: MAX_MUTATION_BATCH + 1 }, () => input))
    ).rejects.toBeInstanceOf(RangeError);
    expect(mocks.syncMutations).not.toHaveBeenCalled();
  });

  it('throws when the outcome count differs from the input count', async () => {
    mocks.syncMutations.mockResolvedValue(ok([]));
    const input = {
      command: { op: 'item.delete', args: {} },
      entityId: 'item-1',
    } as const;

    await expect(sendInventoryMutations([input])).rejects.toMatchObject({
      name: 'ApiError',
      message: 'inventory mutation returned 0 outcomes for 1 mutations',
      status: 200,
    });
  });

  it('wraps an undo transport failure as UndoRefusedError', async () => {
    mocks.syncMutations.mockResolvedValue({
      data: undefined,
      error: { message: 'client too old' },
      response: { status: 426, url: '/inventory-api/sync/mutations' },
    });
    const queryClient = new QueryClient();
    const undo = createUndo(queryClient, optimisticItemsFor(queryClient), 'item-1', 41);

    await expect(undo()).rejects.toMatchObject({
      name: 'UndoRefusedError',
      refusal: { kind: 'failed', error: { status: 426 } },
    });
    await expect(undo()).rejects.toBeInstanceOf(UndoRefusedError);
  });
});
