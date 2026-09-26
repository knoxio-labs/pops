import { describe, expect, it } from 'vitest';

import { flattenLocationTree, toItemRowModel } from './item-row-model';

import type { Lifecycle } from '../foundation/model/model';
import type { WebListResponses } from '../inventory-api/types.gen.js';

type WebItem = WebListResponses['200']['items'][number];

const baseItem: WebItem = {
  access: null,
  catalogueRevision: 3,
  code: 'ABC-1',
  computedValues: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  deletedAt: null,
  documentTitles: [],
  documentsStatus: 'none',
  externalIds: [],
  fieldValues: [],
  fields: {},
  id: 'item-1',
  isContainer: false,
  isFull: null,
  legacyType: null,
  lifecycle: 'active',
  lifecycleChangedAt: null,
  name: 'Cable',
  note: 'Short cable',
  photos: [],
  placement: { kind: 'location', locationId: 'desk' },
  previousPlacement: null,
  provenance: null,
  quantity: 2,
  revision: 4,
  seq: 4,
  typeId: 'type-cable',
  typeKey: 'cable',
  updatedAt: '2026-09-02T00:00:00.000Z',
};

function item(overrides: Partial<WebItem> = {}): WebItem {
  return { ...baseItem, ...overrides };
}

describe('toItemRowModel', () => {
  it('preserves every supported lifecycle and maps all placement shapes', () => {
    const lifecycles: Lifecycle[] = ['active', 'retired', 'discarded', 'lost', 'destroyed'];

    for (const lifecycle of lifecycles) {
      expect(toItemRowModel(item({ lifecycle })).lifecycle).toBe(lifecycle);
    }

    expect(
      toItemRowModel(
        item({
          access: 'open',
          isContainer: true,
          isFull: true,
          placement: { kind: 'container', itemId: 'box-1' },
          previousPlacement: { kind: 'location', locationId: 'old-room' },
        })
      )
    ).toMatchObject({
      container: { access: 'open', full: true },
      placement: { kind: 'container', containerId: 'box-1' },
      previous: { kind: 'location', locationId: 'old-room' },
    });

    expect(
      toItemRowModel(
        item({
          placement: { kind: 'hand' },
          previousPlacement: { kind: 'container', itemId: 'box-2' },
        })
      )
    ).toMatchObject({
      container: null,
      placement: { kind: 'in-hand' },
      previous: { kind: 'container', containerId: 'box-2' },
    });
  });

  it('uses catalogue names and represents an available deleted previous place', () => {
    const model = toItemRowModel(
      item({ previousPlacement: { kind: 'location', locationId: 'old-room' } }),
      {
        typeNames: new Map([['type-cable', 'Cables']]),
        deletedPreviousPlaces: new Map([['old-room', 'Old room']]),
      }
    );

    expect(model.typeName).toBe('Cables');
    expect(model.previous).toEqual({ kind: 'deleted', name: 'Old room' });
    expect(model.sync).toBe('synced');
  });
});

describe('flattenLocationTree', () => {
  it('keeps depth-first display order and infers foundation location kinds', () => {
    expect(
      flattenLocationTree([
        {
          id: 'property',
          name: 'Home',
          parentId: null,
          sortOrder: 0,
          children: [
            {
              id: 'room',
              name: 'Office',
              parentId: 'property',
              sortOrder: 0,
              children: [
                {
                  id: 'desk',
                  name: 'Desk',
                  parentId: 'room',
                  sortOrder: 0,
                  children: [
                    {
                      id: 'drawer',
                      name: 'Drawer',
                      parentId: 'desk',
                      sortOrder: 0,
                      children: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ])
    ).toEqual([
      { id: 'property', name: 'Home', parentId: null, kind: 'property' },
      { id: 'room', name: 'Office', parentId: 'property', kind: 'room' },
      { id: 'desk', name: 'Desk', parentId: 'room', kind: 'furniture' },
      { id: 'drawer', name: 'Drawer', parentId: 'desk', kind: 'storage' },
    ]);
  });
});
