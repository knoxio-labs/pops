import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import { mutation, openHarness, seedLocation, type Harness } from './test-utils.js';

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
        createArgs({ typeKey: 'storage_box', fields: { Footprint: '400x300mm' } }),
        { baseRevision: null }
      )
    );
    expect(h.item(id)).toMatchObject({ isContainer: 1, access: 'open' });
  });

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

  it('leaves an omitted legacy field at its column default rather than writing null', () => {
    const id = randomUUID();
    h.run(mutation('item.create', id, createArgs(), { baseRevision: null }));
    expect(h.item(id).condition).toBe('Good');
  });
});
