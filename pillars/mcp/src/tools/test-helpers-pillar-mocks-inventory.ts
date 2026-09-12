/**
 * The inventory pillar's mock handle and the row fixtures behind it.
 *
 * Split out of `test-helpers.ts` rather than left in it: that file sat at
 * exactly the 200-line oxlint cap, and a file at the cap is one unrelated
 * branch away from ejecting a merge group with nothing showing on either PR
 * (POPS-3026). `test-helpers.ts` re-exports what it used to export, so no
 * test file changed.
 *
 * The `test-helpers-` prefix is load-bearing: `tsconfig.build.json` excludes
 * every `test-helpers*` file from the declaration-emitting build. Inside it,
 * `vi.fn()`'s inferred type cannot be named without reaching into
 * `@vitest/spy`, a devDependency — so `tsc -p tsconfig.build.json` fails with
 * TS2883 while `tsc --noEmit` passes, and only CI sees the difference.
 */
import { vi } from 'vitest';

import { callOk } from './test-helpers-call-results.js';

const LOC = { id: 'loc_1', name: 'Living Room', parentId: null, sortOrder: 0 };
const LOC2 = { id: 'loc_2', name: 'Office', parentId: null, sortOrder: 1 };
const ITEM = {
  id: 'item_1',
  itemName: 'MacBook',
  brand: 'Apple',
  model: 'MacBook Pro 14"',
  type: 'electronics',
  condition: 'good',
  locationId: 'loc_1',
  inUse: true,
  deductible: false,
  assetId: 'MBP01',
  notes: null,
  purchaseDate: null,
  warrantyExpires: null,
  replacementValue: 3000,
  resaleValue: 1500,
  purchasePrice: 3200,
  purchasedFromName: 'Apple Store',
  lastEditedTime: '2025-01-01T00:00:00.000Z',
};
const ITEM2 = { ...ITEM, id: 'item_2', itemName: 'Dell Monitor', assetId: 'MON01' };
const CONN = { id: 1, itemAId: 'item_1', itemBId: 'item_2', createdAt: '2025-01-01' };

export const MOCK_FIXTURE = {
  id: 'fixture_1',
  name: 'Living Room Outlet A',
  type: 'outlet',
  locationId: 'loc_1',
  notes: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  lastEditedTime: '2024-01-01T00:00:00.000Z',
};

export const MOCK_FIXTURE_CONN = {
  id: 1,
  itemId: 'item_1',
  fixtureId: 'fixture_1',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const PAGED1 = { pagination: { total: 1, limit: 50, offset: 0, hasMore: false } };

export const mockPillarInventory = {
  inventory: {
    locations: {
      tree: vi.fn().mockResolvedValue(callOk({ data: [{ ...LOC, children: [] }] })),
      list: vi.fn().mockResolvedValue(callOk({ data: [LOC], total: 1 })),
      create: vi.fn().mockResolvedValue(callOk({ data: LOC2, message: 'Location created' })),
      update: vi.fn().mockResolvedValue(callOk({ data: LOC, message: 'Location updated' })),
      delete: vi.fn().mockResolvedValue(callOk({ message: 'Location deleted' })),
    },
    items: {
      list: vi.fn().mockResolvedValue(callOk({ data: [ITEM], ...PAGED1 })),
      get: vi.fn().mockResolvedValue(callOk({ data: ITEM })),
      create: vi.fn().mockResolvedValue(callOk({ data: ITEM, message: 'Inventory item created' })),
      update: vi.fn().mockResolvedValue(callOk({ data: ITEM, message: 'Inventory item updated' })),
      delete: vi.fn().mockResolvedValue(callOk({ message: 'Inventory item deleted' })),
    },
    connections: {
      listForItem: vi.fn().mockResolvedValue(callOk({ data: [CONN], ...PAGED1 })),
      graph: vi.fn().mockResolvedValue(
        callOk({
          data: { nodes: [ITEM, ITEM2], edges: [{ source: 'item_1', target: 'item_2' }] },
        })
      ),
      connect: vi.fn().mockResolvedValue(callOk({ data: CONN, message: 'Items connected' })),
      disconnect: vi.fn().mockResolvedValue(callOk({ message: 'Items disconnected' })),
    },
    fixtures: {
      list: vi.fn().mockResolvedValue(callOk({ data: [MOCK_FIXTURE], total: 1 })),
      get: vi.fn().mockResolvedValue(callOk({ data: MOCK_FIXTURE })),
      create: vi.fn().mockResolvedValue(callOk({ data: MOCK_FIXTURE, message: 'Fixture created' })),
      update: vi.fn().mockResolvedValue(callOk({ data: MOCK_FIXTURE, message: 'Fixture updated' })),
      delete: vi.fn().mockResolvedValue(callOk({ message: 'Fixture deleted' })),
      connect: vi
        .fn()
        .mockResolvedValue(
          callOk({ data: MOCK_FIXTURE_CONN, message: 'Item connected to fixture' })
        ),
      disconnect: vi.fn().mockResolvedValue(callOk({ message: 'Item disconnected from fixture' })),
      listForItem: vi.fn().mockResolvedValue(callOk({ data: [MOCK_FIXTURE_CONN], ...PAGED1 })),
    },
  },
};
