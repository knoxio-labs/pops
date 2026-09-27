import { buildWorld } from '../../foundation/model/placement-model.js';

import type { ItemRowModel, LocationModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { WebMovingGetResponse } from '../../inventory-api/types.gen.js';

export type TestMovingBox = WebMovingGetResponse['boxes'][number];

export function thing(
  id: string,
  name: string,
  containerId: string,
  overrides: Partial<TestMovingBox['contents'][number]> = {}
): TestMovingBox['contents'][number] {
  return { id, name, code: null, quantity: 1, containerId, ...overrides };
}

export function box(
  id: string,
  name: string,
  stage: TestMovingBox['stage'],
  overrides: Partial<TestMovingBox> = {}
): TestMovingBox {
  return {
    id,
    name,
    code: null,
    stage,
    count: 0,
    destination: null,
    placement: { kind: 'location', locationId: 'kitchen' },
    contents: [],
    ...overrides,
  };
}

export function movingData(overrides: Partial<WebMovingGetResponse> = {}): WebMovingGetResponse {
  const packing = box('box-2', 'Box 2', 'packing', {
    contents: [thing('item-kettle', 'Kettle', 'box-2', { code: 'KET-1' })],
    count: 1,
  });
  const full = box('box-10', 'Box 10', 'full', {
    code: 'BOX-10',
    destination: { optionKey: 'storage', label: 'Storage unit' },
    contents: [thing('item-lamp', 'Lamp', 'box-10')],
    count: 1,
  });
  const closed = box('box-1', 'Box 1', 'closed', {
    destination: { optionKey: 'parents', label: 'Parents' },
    contents: [thing('item-books', 'Books', 'box-1', { quantity: 2 })],
    count: 1,
  });
  return {
    boxes: [packing, full, closed],
    stages: { packing: 1, full: 1, closed: 1 },
    packed: 3,
    loose: [
      {
        room: { id: 'kitchen', name: 'Kitchen' },
        items: [
          { id: 'item-plant', name: 'Plant', code: null, quantity: 1 },
          { id: 'item-mug', name: 'Mug', code: null, quantity: 1 },
        ],
      },
    ],
    looseCount: 2,
    inHand: [{ id: 'item-phone', name: 'Phone', code: null, quantity: 1 }],
    unlabelledClosed: 1,
    destinationOptions: [
      { optionKey: 'storage', label: 'Storage unit' },
      { optionKey: 'parents', label: 'Parents' },
    ],
    ...overrides,
  };
}

export function location(id: string, name: string, parentId: string | null = null): LocationModel {
  return { id, name, parentId, kind: parentId === null ? 'property' : 'room' };
}

export function row(id: string, name: string, overrides: Partial<ItemRowModel> = {}): ItemRowModel {
  return {
    id,
    name,
    typeId: null,
    typeName: null,
    code: null,
    quantity: 1,
    container: null,
    lifecycle: 'active',
    placement: { kind: 'location', locationId: 'kitchen' },
    previous: null,
    sync: 'synced',
    photoUrl: null,
    note: null,
    updatedAt: '2026-09-27T00:00:00.000Z',
    ...overrides,
  };
}

function placementForBox(entry: TestMovingBox): ItemRowModel['placement'] {
  if (entry.placement.kind === 'location') {
    return { kind: 'location', locationId: entry.placement.locationId };
  }
  if (entry.placement.kind === 'container') {
    return { kind: 'container', containerId: entry.placement.itemId };
  }
  return { kind: 'in-hand' };
}

export function worldForMovingData(data: WebMovingGetResponse = movingData()): PlacementWorld {
  const items = data.boxes.map((entry) =>
    row(entry.id, entry.name, {
      code: entry.code,
      container: {
        access: entry.stage === 'closed' ? 'closed' : 'open',
        full: entry.stage === 'full',
      },
      placement: placementForBox(entry),
    })
  );
  const kitchenItems = data.loose[0]?.items ?? [];
  items.push(
    ...kitchenItems.map((entry) => row(entry.id, entry.name, { quantity: entry.quantity })),
    ...data.inHand.map((entry) =>
      row(entry.id, entry.name, {
        quantity: entry.quantity,
        placement: { kind: 'in-hand' },
      })
    )
  );
  return buildWorld(items, [location('home', 'Home'), location('kitchen', 'Kitchen', 'home')]);
}
