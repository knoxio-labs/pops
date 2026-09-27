import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model';
import { createTestQueryClient, withQueryClient } from '../../inventory-web/test-utils';
import { useFormSources } from './use-form-sources';

import type { WebGetResponses } from '../../inventory-api/types.gen.js';

const mocks = vi.hoisted(() => ({
  useCatalogueLookups: vi.fn(),
  usePlacementSources: vi.fn(),
  useWebItemDetail: vi.fn(),
}));

vi.mock('../../inventory-web/useCatalogueLookups.js', () => ({
  useCatalogueLookups: mocks.useCatalogueLookups,
}));
vi.mock('../../inventory-web/usePlacementSources.js', () => ({
  usePlacementSources: mocks.usePlacementSources,
}));
vi.mock('../../inventory-web/useWebItemDetail.js', () => ({
  useWebItemDetail: mocks.useWebItemDetail,
}));

type WebItem = WebGetResponses[200]['item'];

const item: WebItem = {
  access: null,
  catalogueRevision: 1,
  code: null,
  computedValues: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  documentTitles: [],
  documentsStatus: 'none',
  externalIds: [],
  fieldValues: [
    {
      catalogueRevision: 1,
      fieldId: 'related',
      source: 'stored',
      values: [{ targetKind: 'item', targetId: 'target-item' }],
    },
  ],
  fields: {},
  id: 'item-1',
  isContainer: false,
  isFull: null,
  legacyType: null,
  lifecycle: 'active',
  lifecycleChangedAt: null,
  name: 'Desk lamp',
  note: null,
  photos: [],
  placement: { kind: 'hand' },
  previousPlacement: null,
  provenance: null,
  quantity: 1,
  revision: 1,
  seq: 1,
  typeId: null,
  typeKey: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('useFormSources', () => {
  it('loads stored item-reference targets into the edit placement world', () => {
    mocks.useCatalogueLookups.mockReturnValue({
      catalogue: undefined,
      types: [],
      typeById: new Map(),
      typeNameById: new Map(),
      typeForId: () => null,
      typeNameForId: () => null,
      isPending: false,
      error: null,
    });
    mocks.useWebItemDetail.mockReturnValue({ data: { item }, isPending: false, error: null });
    mocks.usePlacementSources.mockReturnValue({
      world: buildWorld([], []),
      recents: [],
      createLocation: { mutateAsync: vi.fn() },
      isLoading: false,
      error: null,
    });

    const client = createTestQueryClient();
    renderHook(() => useFormSources('item-1'), { wrapper: withQueryClient(client) });

    expect(mocks.usePlacementSources).toHaveBeenCalledWith({
      kind: 'items',
      ids: ['item-1', 'target-item'],
    });
  });
});
