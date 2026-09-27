import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../foundation/model/placement-model.js';
import { InventoryApiError } from '../inventory-api-helpers.js';
import { eventActorOf, toEventModel } from './event-model.js';
import { UndoRefusedError } from './item-verbs.js';
import { createTestQueryClient, withQueryClient } from './test-utils.js';
import { useRevertEvent } from './useRevertEvent.js';

import type { EventModel, ItemRowModel } from '../foundation/model/model.js';
import type { PlacementWorld } from '../foundation/model/placement-model.js';
import type { WebEvent } from './useWebEvents.js';

const mocks = vi.hoisted(() => ({ sendInventoryMutation: vi.fn() }));

vi.mock('./mutation-client.js', () => ({
  sendInventoryMutation: (...args: unknown[]) => mocks.sendInventoryMutation(...args),
}));

const baseEvent: WebEvent = {
  actor: { kind: 'web', label: 'Joao on the web' },
  after: {},
  before: {},
  clientTime: null,
  compensatesSeq: null,
  entityId: 'item-1',
  entityKind: 'item',
  entityName: 'Television',
  fields: [],
  kind: 'created',
  reason: null,
  seq: 1,
  serverTime: '2026-09-23T11:00:00.000Z',
  undoable: true,
};

function event(overrides: Partial<WebEvent> = {}): WebEvent {
  return { ...baseEvent, ...overrides };
}

function item(id: string, name: string): ItemRowModel {
  return {
    id,
    name,
    typeId: null,
    typeName: null,
    code: null,
    quantity: 1,
    container: null,
    lifecycle: 'active',
    placement: { kind: 'in-hand' },
    previous: null,
    sync: 'synced',
    photoUrl: null,
    note: null,
    updatedAt: '2026-09-23T11:00:00.000Z',
  };
}

const world: PlacementWorld = buildWorld(
  [item('toolbox-1', 'Red toolbox')],
  [{ id: 'garage', name: 'Garage', parentId: null, kind: 'room' }]
);
const typeNames = new Map([['type-electronics', 'Electronics']]);

function expectMapping(
  source: WebEvent,
  expected: Pick<EventModel, 'kind' | 'summary' | 'before' | 'after'>,
  sourceWorld: PlacementWorld = world
): void {
  expect(toEventModel(source, sourceWorld, typeNames)).toMatchObject(expected);
}

describe('event model conversion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps placement kinds: moved and stored to moved, picked_up, put_back, opened and closed', () => {
    expectMapping(
      event({
        kind: 'moved',
        before: { placement: { kind: 'location', locationId: 'garage' } },
        after: { placement: { kind: 'container', itemId: 'toolbox-1' } },
      }),
      { kind: 'moved', summary: 'Moved into Red toolbox', before: 'Garage', after: 'Red toolbox' }
    );
    expectMapping(
      event({
        kind: 'moved',
        before: {},
        after: { placement: { kind: 'hand' } },
      }),
      { kind: 'moved', summary: 'Moved in hand', before: null, after: 'In hand' }
    );
    expectMapping(
      event({
        kind: 'stored',
        before: { placement: { kind: 'hand' } },
        after: { placement: { kind: 'location', locationId: 'garage' } },
      }),
      { kind: 'moved', summary: 'Stored in Garage', before: 'In hand', after: 'Garage' }
    );
    expectMapping(
      event({
        kind: 'picked_up',
        before: { placement: { kind: 'container', itemId: 'toolbox-1' } },
        after: { placement: { kind: 'hand' } },
      }),
      {
        kind: 'picked-up',
        summary: 'Picked up from Red toolbox',
        before: 'Red toolbox',
        after: 'In hand',
      }
    );
    expectMapping(
      event({ kind: 'picked_up', before: {}, after: { placement: { kind: 'hand' } } }),
      {
        kind: 'picked-up',
        summary: 'Picked up. It had no place yet',
        before: null,
        after: 'In hand',
      }
    );
    expectMapping(
      event({
        kind: 'put_back',
        before: { placement: { kind: 'hand' } },
        after: { placement: { kind: 'location', locationId: 'garage' } },
      }),
      { kind: 'put-back', summary: 'Put back on Garage', before: 'In hand', after: 'Garage' }
    );
    expectMapping(
      event({ kind: 'opened', before: { access: 'closed' }, after: { access: 'open' } }),
      { kind: 'opened', summary: 'Opened', before: 'Closed', after: 'Open' }
    );
    expectMapping(
      event({ kind: 'closed', before: { access: 'open' }, after: { access: 'closed' } }),
      { kind: 'closed', summary: 'Closed', before: 'Open', after: 'Closed' }
    );
  });

  it('maps edited by what it touched: a rename, full, photos added or not, one field and several', () => {
    expectMapping(
      event({
        kind: 'edited',
        fields: ['name'],
        before: { name: 'Old name' },
        after: { name: 'New name' },
      }),
      {
        kind: 'field-changed',
        summary: 'Renamed to New name',
        before: 'Old name',
        after: 'New name',
      }
    );
    expectMapping(
      event({
        kind: 'edited',
        fields: ['isFull'],
        before: { isFull: false },
        after: { isFull: true },
      }),
      { kind: 'field-changed', summary: 'Marked full', before: 'Not full', after: 'Full' }
    );
    expectMapping(
      event({
        kind: 'edited',
        fields: ['photos'],
        before: { photos: ['one'] },
        after: { photos: ['one', 'two'] },
      }),
      { kind: 'photo-added', summary: 'Photo added', before: null, after: null }
    );
    expectMapping(
      event({
        kind: 'edited',
        fields: ['photos'],
        before: { photos: ['one', 'two'] },
        after: { photos: ['one'] },
      }),
      { kind: 'field-changed', summary: 'Photo removed', before: null, after: null }
    );
    expectMapping(
      event({
        kind: 'edited',
        fields: ['photos'],
        before: { photos: ['one'] },
        after: { photos: ['two'] },
      }),
      { kind: 'field-changed', summary: 'Photos reordered', before: null, after: null }
    );
    expectMapping(
      event({
        kind: 'edited',
        fields: ['purchaseDate'],
        before: { purchaseDate: '2025-01-01' },
        after: { purchaseDate: '2025-02-01' },
      }),
      {
        kind: 'field-changed',
        summary: 'Purchase Date changed',
        before: '2025-01-01',
        after: '2025-02-01',
      }
    );
    expectMapping(
      event({
        kind: 'edited',
        fields: ['replacementValue'],
        before: { replacementValue: 2399 },
        after: { replacementValue: 2499 },
      }),
      { kind: 'field-changed', summary: 'Replacement value changed', before: '2399', after: '2499' }
    );
    expectMapping(
      event({
        kind: 'edited',
        fields: ['name', 'note'],
        before: { name: 'Old name', note: 'Old note' },
        after: { name: 'New name', note: 'New note' },
      }),
      { kind: 'field-changed', summary: 'Edited', before: null, after: null }
    );
  });

  it('maps code_set, type_changed, quantity_changed, split_from and split_into', () => {
    expectMapping(event({ kind: 'code_set', before: { code: null }, after: { code: 'TV1' } }), {
      kind: 'code-set',
      summary: 'Code set to TV1',
      before: null,
      after: 'TV1',
    });
    expectMapping(event({ kind: 'code_set', before: { code: 'TV1' }, after: { code: null } }), {
      kind: 'code-set',
      summary: 'Code cleared',
      before: 'TV1',
      after: null,
    });
    expectMapping(
      event({
        kind: 'type_changed',
        before: { typeId: null },
        after: { typeId: 'type-electronics' },
      }),
      { kind: 'type-set', summary: 'Type set to Electronics', before: null, after: 'Electronics' }
    );
    expectMapping(
      event({ kind: 'type_changed', before: { typeKey: 'old' }, after: { typeKey: 'new' } }),
      { kind: 'type-set', summary: 'Type set to new', before: 'old', after: 'new' }
    );
    expectMapping(
      event({ kind: 'quantity_changed', before: { quantity: 8 }, after: { quantity: 6 } }),
      { kind: 'quantity-changed', summary: 'Quantity 8 to 6', before: '8', after: '6' }
    );
    expectMapping(event({ kind: 'split_from', before: { quantity: 8 }, after: { quantity: 4 } }), {
      kind: 'split',
      summary: 'Split 4 into a new item',
      before: '8',
      after: '4',
    });
    expectMapping(event({ kind: 'split_into', before: {}, after: { quantity: 4 } }), {
      kind: 'split',
      summary: 'Split into',
      before: null,
      after: '4',
    });
  });

  it('maps photo_added, photo_removed, override_set and override_cleared', () => {
    expectMapping(event({ kind: 'photo_added', before: {}, after: { photos: ['one'] } }), {
      kind: 'photo-added',
      summary: 'Photo added',
      before: null,
      after: null,
    });
    expectMapping(
      event({ kind: 'photo_removed', before: { photos: ['one'] }, after: { photos: [] } }),
      { kind: 'field-changed', summary: 'Photo removed', before: null, after: null }
    );
    expectMapping(event({ kind: 'override_set', before: {}, after: {} }), {
      kind: 'field-changed',
      summary: 'Override set',
      before: null,
      after: null,
    });
    expectMapping(event({ kind: 'override_cleared', before: {}, after: {} }), {
      kind: 'field-changed',
      summary: 'Override cleared',
      before: null,
      after: null,
    });
  });

  it('maps lifecycle_changed by its new value, active as restored and anything else as field-changed, and restored', () => {
    expectMapping(
      event({
        kind: 'lifecycle_changed',
        before: { lifecycle: 'active' },
        after: { lifecycle: 'retired' },
      }),
      { kind: 'retired', summary: 'Retired', before: 'Active', after: 'Retired' }
    );
    expectMapping(
      event({
        kind: 'lifecycle_changed',
        before: { lifecycle: 'active' },
        after: { lifecycle: 'discarded' },
      }),
      { kind: 'discarded', summary: 'Discarded', before: 'Active', after: 'Discarded' }
    );
    expectMapping(
      event({
        kind: 'lifecycle_changed',
        before: { lifecycle: 'active' },
        after: { lifecycle: 'lost' },
      }),
      { kind: 'lost', summary: 'Marked lost', before: 'Active', after: 'Lost' }
    );
    expectMapping(
      event({
        kind: 'lifecycle_changed',
        before: { lifecycle: 'active' },
        after: { lifecycle: 'destroyed' },
      }),
      { kind: 'destroyed', summary: 'Destroyed', before: 'Active', after: 'Destroyed' }
    );
    expectMapping(
      event({
        kind: 'lifecycle_changed',
        before: { lifecycle: 'discarded' },
        after: { lifecycle: 'active' },
      }),
      { kind: 'restored', summary: 'Restored from Discarded', before: 'Discarded', after: 'Active' }
    );
    expectMapping(
      event({
        kind: 'lifecycle_changed',
        before: { lifecycle: 'active' },
        after: { lifecycle: 'archived' },
      }),
      { kind: 'field-changed', summary: 'Lifecycle changed', before: null, after: null }
    );
    expectMapping(event({ kind: 'restored', before: {}, after: {} }), {
      kind: 'restored',
      summary: 'Restored',
      before: null,
      after: null,
    });
  });

  it('maps created, reverted, deleted and an unknown kind by its words', () => {
    expectMapping(event({ kind: 'created', before: {}, after: {} }), {
      kind: 'created',
      summary: 'Created',
      before: null,
      after: null,
    });
    expectMapping(event({ kind: 'reverted', before: {}, after: {} }), {
      kind: 'field-changed',
      summary: 'Reverted',
      before: null,
      after: null,
    });
    expectMapping(event({ kind: 'deleted', before: {}, after: {} }), {
      kind: 'field-changed',
      summary: 'Deleted',
      before: null,
      after: null,
    });
    expectMapping(event({ kind: 'some_kind', before: {}, after: {} }), {
      kind: 'field-changed',
      summary: 'Some kind',
      before: null,
      after: null,
    });
  });

  it('narrows the four actor kinds and reads an unknown actor kind as service', () => {
    for (const kind of ['device', 'web', 'service', 'migration']) {
      expect(eventActorOf(event({ actor: { kind, label: 'Actor' } }))).toBe(kind);
    }
    expect(eventActorOf(event({ actor: { kind: 'future', label: 'Future actor' } }))).toBe(
      'service'
    );
  });

  it('names a missing place instead of an id', () => {
    expectMapping(
      event({
        kind: 'moved',
        before: { placement: { kind: 'location', locationId: 'missing-location' } },
        after: { placement: { kind: 'container', itemId: 'missing-container' } },
      }),
      {
        kind: 'moved',
        summary: 'Moved into Unknown container',
        before: 'Unknown place',
        after: 'Unknown container',
      },
      buildWorld([], [])
    );
  });

  it('an event that compensates another is not undoable', () => {
    const model = toEventModel(
      event({ kind: 'edited', compensatesSeq: 4, undoable: true }),
      world,
      typeNames
    );
    expect(model.undoable).toBe(false);
  });
});

describe('useRevertEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends event.revert without a base revision and invalidates the web queries', async () => {
    mocks.sendInventoryMutation.mockResolvedValue({
      mutationId: 'm1',
      status: 'applied',
      revision: 8,
      seq: 9,
      converged: false,
    });
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const { result } = renderHook(() => useRevertEvent(), {
      wrapper: withQueryClient(queryClient),
    });

    await expect(result.current({ seq: 7, entityId: 'item-1' })).resolves.toBeUndefined();
    expect(mocks.sendInventoryMutation).toHaveBeenCalledWith({
      command: { op: 'event.revert', args: { seq: 7 } },
      entityId: 'item-1',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory', 'web'] });
  });

  it('rejects with UndoRefusedError for a non-applied outcome and still invalidates', async () => {
    const outcome = {
      mutationId: 'm1',
      status: 'rejected',
      reason: 'conflict',
      message: 'changed since',
    };
    mocks.sendInventoryMutation.mockResolvedValue(outcome);
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const { result } = renderHook(() => useRevertEvent(), {
      wrapper: withQueryClient(queryClient),
    });

    await expect(result.current({ seq: 7, entityId: 'item-1' })).rejects.toBeInstanceOf(
      UndoRefusedError
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory', 'web'] });
  });

  it('rethrows a transport error and still invalidates', async () => {
    const error = new InventoryApiError('offline', 503);
    mocks.sendInventoryMutation.mockRejectedValue(error);
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const { result } = renderHook(() => useRevertEvent(), {
      wrapper: withQueryClient(queryClient),
    });

    await expect(result.current({ seq: 7, entityId: 'item-1' })).rejects.toBe(error);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory', 'web'] });
  });
});
