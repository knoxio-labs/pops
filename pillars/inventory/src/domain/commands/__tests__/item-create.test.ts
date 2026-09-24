import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import { mutation, openHarness, seedItem, seedLocation, type Harness } from './test-utils.js';

let h: Harness;

function createArgs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { item: { name: 'Kettle', placement: { kind: 'hand' }, ...overrides } };
}

beforeEach(() => {
  h = openHarness();
  seedLocation(h, 'shelf');
});

describe('item.create', () => {
  it('creates an untyped item in hand at revision 1', () => {
    const id = randomUUID();
    const outcome = h.run(mutation('item.create', id, createArgs(), { baseRevision: null }));
    expect(outcome).toMatchObject({ status: 'applied', revision: 1 });
    expect(h.item(id)).toMatchObject({
      name: 'Kettle',
      placementKind: 'hand',
      isContainer: 0,
      access: null,
      quantity: 1,
    });
    const [event] = h.eventsFor(id);
    expect(event?.kind).toBe('created');
  });

  it('creates at a location', () => {
    const id = randomUUID();
    h.run(
      mutation(
        'item.create',
        id,
        createArgs({ placement: { kind: 'location', locationId: 'shelf' } }),
        {
          baseRevision: null,
        }
      )
    );
    expect(h.item(id)).toMatchObject({ placementKind: 'location', locationId: 'shelf' });
  });

  it('rejects a placement at a location that does not exist', () => {
    const id = randomUUID();
    const outcome = h.run(
      mutation(
        'item.create',
        id,
        createArgs({ placement: { kind: 'location', locationId: 'nowhere' } }),
        {
          baseRevision: null,
        }
      )
    );
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'target_missing' });
  });

  it('rejects an unknown type', () => {
    const id = randomUUID();
    const outcome = h.run(
      mutation('item.create', id, createArgs({ typeKey: 'no_such_type' }), { baseRevision: null })
    );
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'type_unknown' });
  });

  it('rejects fields on an untyped item', () => {
    const id = randomUUID();
    const outcome = h.run(
      mutation('item.create', id, createArgs({ fields: { colour: 'red' } }), { baseRevision: null })
    );
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'invalid' });
  });

  it('sets is_container and a default open access from the type', () => {
    const id = randomUUID();
    h.run(
      mutation(
        'item.create',
        id,
        createArgs({
          typeKey: 'storage_box',
          fields: { Width: { value: 40, unit: 'cm' } },
        }),
        { baseRevision: null }
      )
    );
    expect(h.item(id)).toMatchObject({ isContainer: 1, access: 'open' });
  });

  it.each([
    ['mm', 100, 10],
    ['cm', 1, 1],
    ['m', 1, 100],
  ] as const)(
    'converts protocol-1 length values from %s to the persisted fixed unit',
    (unit, value, expected) => {
      const id = randomUUID();
      const outcome = h.run(
        mutation(
          'item.create',
          id,
          createArgs({ typeKey: 'storage_box', fields: { Width: { value, unit } } }),
          { baseRevision: null }
        )
      );

      expect(outcome).toMatchObject({ status: 'applied' });
      expect(h.fields(id)).toEqual({ Width: { value: expected, unit: 'cm' } });
    }
  );

  it('rejects fields that do not fit the declared type', () => {
    const id = randomUUID();
    const outcome = h.run(
      mutation(
        'item.create',
        id,
        createArgs({ typeKey: 'storage_box', fields: { Capacity: 'not-a-measurement' } }),
        {
          baseRevision: null,
        }
      )
    );
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'invalid' });
  });

  it('rejects a non-UUID entityId', () => {
    const outcome = h.run(
      mutation('item.create', 'not-a-uuid', createArgs(), { baseRevision: null })
    );
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'invalid' });
  });

  it('rejects a container created with quantity greater than 1 (ADR-002 D3)', () => {
    const id = randomUUID();
    const outcome = h.run(
      mutation(
        'item.create',
        id,
        createArgs({
          typeKey: 'storage_box',
          fields: { Width: { value: 40, unit: 'cm' } },
          quantity: 2,
        }),
        { baseRevision: null }
      )
    );
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'quantity_container_conflict' });
  });

  it('allows a non-container type created with quantity greater than 1', () => {
    const id = randomUUID();
    const outcome = h.run(
      mutation('item.create', id, createArgs({ quantity: 5 }), { baseRevision: null })
    );
    expect(outcome).toMatchObject({ status: 'applied' });
    expect(h.item(id).quantity).toBe(5);
  });

  it('rejects a create for an id that already exists', () => {
    const id = randomUUID();
    h.run(mutation('item.create', id, createArgs(), { baseRevision: null }));
    const outcome = h.run(
      mutation('item.create', id, createArgs({ name: 'Again' }), { baseRevision: null })
    );
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'invalid' });
    expect(h.item(id).name).toBe('Kettle');
  });
});

describe('item.create with legacy fields (POPS-4053)', () => {
  it('writes the legacy provenance columns and a code, none of which the new model itself has a field for', () => {
    const id = randomUUID();
    const outcome = h.run(
      mutation(
        'item.create',
        id,
        {
          ...createArgs(),
          legacy: { brand: 'Bosch', room: 'Kitchen', inUse: true },
          code: 'B412',
        },
        { baseRevision: null }
      )
    );
    expect(outcome).toMatchObject({ status: 'applied' });
    expect(h.item(id)).toMatchObject({ brand: 'Bosch', room: 'Kitchen', inUse: 1, code: 'B412' });
  });

  it('indexes a code given at creation, so the item is findable by code without a later edit', () => {
    const id = randomUUID();
    h.run(mutation('item.create', id, { ...createArgs(), code: 'B412' }, { baseRevision: null }));

    const row = h.raw.prepare('select id from items_fts where code = ?').get('B412');
    expect(row).toEqual({ id });
  });

  it('leaves an omitted legacy field at its column default rather than writing null', () => {
    const id = randomUUID();
    h.run(mutation('item.create', id, createArgs(), { baseRevision: null }));
    expect(h.item(id).condition).toBe('Good');
  });
});

describe('item.create with a code already held (POPS-4063)', () => {
  it('is a code_collision conflict naming the holder and a free code, and creates nothing', () => {
    seedItem(h, { id: 'lamp', code: 'B412' });
    const id = randomUUID();
    const outcome = h.run(
      mutation('item.create', id, { ...createArgs(), code: 'b412' }, { baseRevision: null })
    );
    expect(outcome).toMatchObject({
      status: 'conflict',
      kind: 'code_collision',
      heldBy: { id: 'lamp', name: 'lamp' },
      suggestedCode: 'b413',
    });
    expect(h.raw.prepare('select id from items where id = ?').get(id)).toBeUndefined();
    expect(h.eventsFor(id)).toEqual([]);
  });

  it('collides with a code a tombstoned item still reserves', () => {
    seedItem(h, { id: 'old-lamp', code: 'B412', deletedAt: '2026-09-18T01:00:00.000Z' });
    const id = randomUUID();
    const outcome = h.run(
      mutation('item.create', id, { ...createArgs(), code: 'B412' }, { baseRevision: null })
    );
    expect(outcome).toMatchObject({
      status: 'conflict',
      kind: 'code_collision',
      heldBy: { id: 'old-lamp' },
    });
    expect(h.raw.prepare('select id from items where id = ?').get(id)).toBeUndefined();
  });

  it('creates with a free code, and a later create wanting the same code collides', () => {
    const first = randomUUID();
    const applied = h.run(
      mutation('item.create', first, { ...createArgs(), code: 'C7' }, { baseRevision: null })
    );
    expect(applied).toMatchObject({ status: 'applied' });
    expect(h.item(first).code).toBe('C7');

    const second = randomUUID();
    const collided = h.run(
      mutation('item.create', second, { ...createArgs(), code: 'C7' }, { baseRevision: null })
    );
    expect(collided).toMatchObject({
      status: 'conflict',
      kind: 'code_collision',
      heldBy: { id: first, name: 'Kettle' },
      suggestedCode: 'C8',
    });
  });

  it('a code without trailing digits collides with no suggestion', () => {
    seedItem(h, { id: 'lamp', code: 'KITCHEN' });
    const outcome = h.run(
      mutation(
        'item.create',
        randomUUID(),
        { ...createArgs(), code: 'KITCHEN' },
        {
          baseRevision: null,
        }
      )
    );
    expect(outcome).toMatchObject({ status: 'conflict', suggestedCode: null });
  });
});
