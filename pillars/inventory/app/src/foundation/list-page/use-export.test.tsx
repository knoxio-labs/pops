import { act, renderHook } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WEB_ITEMS_MAX_IDS } from '@pops/inventory';

import { buildWorld } from '../model/placement-model.js';
import * as csv from './inventory-csv.js';
import { useItemsExport } from './use-export.js';

import type { WebListData, WebListResponses } from '../../inventory-api/types.gen.js';
import type { WebItem } from '../../inventory-web/item-row-model.js';
import type { CatalogueType } from '../../inventory-web/useCatalogueLookups.js';
import type { ItemRowModel, LocationModel } from '../model/model.js';

const mocks = vi.hoisted(() => ({
  useCatalogueLookups: vi.fn(),
  usePlacementSources: vi.fn(),
  webList: vi.fn(),
}));

vi.mock('../../inventory-api/index.js', () => ({
  webList: (...args: unknown[]) => mocks.webList(...args),
}));

vi.mock('../../inventory-web/useCatalogueLookups.js', () => ({
  useCatalogueLookups: mocks.useCatalogueLookups,
}));

vi.mock('../../inventory-web/usePlacementSources.js', () => ({
  usePlacementSources: mocks.usePlacementSources,
}));

type WebListPage = WebListResponses['200'];
type CatalogueField = CatalogueType['fields'][number];
type FieldValue = WebItem['fieldValues'][number];
type ComputedValue = WebItem['computedValues'][number];

const baseItem: WebItem = {
  access: null,
  catalogueRevision: 1,
  code: null,
  computedValues: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  deletedAt: null,
  documentTitles: [],
  documentsStatus: 'none',
  externalIds: [],
  fieldValues: [],
  fields: {},
  id: 'item',
  isContainer: false,
  isFull: null,
  legacyType: null,
  lifecycle: 'active',
  lifecycleChangedAt: null,
  name: 'Item',
  note: null,
  photos: [],
  placement: { kind: 'location', locationId: 'garage' },
  previousPlacement: null,
  provenance: null,
  quantity: 1,
  revision: 1,
  seq: 1,
  typeId: null,
  typeKey: null,
  updatedAt: '2026-09-02T00:00:00.000Z',
};

const garage: LocationModel = {
  id: 'garage',
  name: 'Garage',
  parentId: null,
  kind: 'property',
};

function item(id: string, overrides: Partial<WebItem> = {}): WebItem {
  return { ...baseItem, ...overrides, id, name: overrides.name ?? id };
}

function rowModel(
  id: string,
  name: string,
  placement: ItemRowModel['placement'] = { kind: 'in-hand' }
): ItemRowModel {
  return {
    id,
    name,
    typeId: null,
    typeName: null,
    code: null,
    quantity: 1,
    container: null,
    lifecycle: 'active',
    placement,
    previous: null,
    sync: 'synced',
    photoUrl: null,
    note: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } };
}

function page(items: readonly WebItem[], nextCursor: string | null = null): WebListPage {
  return {
    contentCounts: {},
    hiddenInactiveCount: 0,
    items: [...items],
    nextCursor,
    total: items.length,
    unfilteredTotal: items.length,
  };
}

function field(
  typeId: string,
  id: string,
  label: string,
  storage: 'stored' | 'computed',
  sortOrder = 0
): CatalogueField {
  return {
    allowOverride: storage === 'computed',
    archivedAt: null,
    cardinality: 'one',
    defaultValues: [],
    enumOptions: [],
    expression: null,
    expressionVersion: null,
    fixedUnit: null,
    help: null,
    id,
    key: id,
    kind: 'short_text',
    label,
    presentation: {},
    referenceKinds: [],
    referenceTypeIds: [],
    replacedBy: null,
    required: false,
    sortOrder,
    storage,
    typeId,
  };
}

function catalogueType(
  id: string,
  label: string,
  fields: readonly CatalogueField[] = [],
  parentTypeId: string | null = null
): CatalogueType {
  return {
    archivedAt: null,
    capabilities: [],
    description: null,
    fields: [...fields],
    id,
    key: id,
    label,
    legacyLabels: [],
    parentTypeId,
    presentation: {},
    replacedBy: null,
    revision: 1,
    sortOrder: 0,
  };
}

function storedValue(fieldId: string, values: unknown[]): FieldValue {
  return { catalogueRevision: 1, fieldId, source: 'stored', values };
}

function overrideValue(fieldId: string, values: unknown[]): FieldValue {
  return { catalogueRevision: 1, fieldId, source: 'override', values };
}

function computedValue(fieldId: string, value: unknown): Extract<ComputedValue, { state: 'ok' }> {
  return {
    catalogueRevision: 1,
    dependencies: [],
    fieldId,
    source: 'computed',
    state: 'ok',
    traversedItemIds: [],
    values: [value],
  };
}

function overriddenValue(
  fieldId: string,
  value: unknown
): Extract<ComputedValue, { state: 'overridden' }> {
  return {
    catalogueRevision: 1,
    dependencies: [],
    fieldId,
    override: { catalogueRevision: 1 },
    source: 'computed',
    state: 'overridden',
    traversedItemIds: [],
    values: [value],
  };
}

function unavailableValue(fieldId: string): Extract<ComputedValue, { state: 'unavailable' }> {
  return {
    catalogueRevision: 1,
    dependencies: [],
    failedFieldId: fieldId,
    fieldId,
    missingInputs: [],
    reason: 'missing input',
    source: 'computed',
    state: 'unavailable',
    traversedItemIds: [],
  };
}

function setSources(
  options: {
    readonly types?: readonly CatalogueType[];
    readonly locations?: readonly LocationModel[];
    readonly worldItems?: readonly ItemRowModel[];
    readonly isLoading?: boolean;
  } = {}
): void {
  const types = options.types ?? [];
  const typeById = new Map(types.map((type) => [type.id, type] as const));
  const typeNameById = new Map(types.map((type) => [type.id, type.label] as const));
  mocks.useCatalogueLookups.mockReturnValue({
    catalogue: undefined,
    types,
    typeById,
    typeNameById,
    typeForId: (id: string | null | undefined) =>
      id === null || id === undefined ? null : (typeById.get(id) ?? null),
    typeNameForId: (id: string | null | undefined) =>
      id === null || id === undefined ? null : (typeNameById.get(id) ?? null),
    isPending: false,
    error: null,
  });
  mocks.usePlacementSources.mockReturnValue({
    world: buildWorld(options.worldItems ?? [], options.locations ?? [garage]),
    isLoading: options.isLoading ?? false,
  });
}

const filters = {
  q: '',
  typeKey: null,
  untyped: false,
  inactive: false,
  within: null,
  sort: 'name' as const,
  view: 'table' as const,
};

function downloadedCsv(): string {
  const call = vi.mocked(csv.downloadCsv).mock.calls.at(-1);
  if (call === undefined) throw new Error('No CSV was downloaded');
  return call[1];
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  setSources();
  vi.spyOn(csv, 'downloadCsv').mockImplementation(() => undefined);
  vi.spyOn(toast, 'error').mockImplementation(() => 'toast');
});

describe('useItemsExport', () => {
  it('exports every page of the current filters', async () => {
    mocks.webList.mockImplementation(async ({ query }: { query: WebListData['query'] }) =>
      query.cursor === undefined ? ok(page([item('first')], 'next')) : ok(page([item('second')]))
    );
    const { result } = renderHook(() => useItemsExport());

    await act(async () => {
      await result.current.exportView(filters);
    });

    expect(mocks.webList).toHaveBeenNthCalledWith(1, {
      query: { sort: 'name', limit: WEB_ITEMS_MAX_IDS, cursor: undefined },
    });
    expect(mocks.webList).toHaveBeenNthCalledWith(2, {
      query: { sort: 'name', limit: WEB_ITEMS_MAX_IDS, cursor: 'next' },
    });
    expect(downloadedCsv()).toContain('first');
    expect(downloadedCsv()).toContain('second');
  });

  it('exports the selection in chunks of 200 ids joined with commas and includeInactive true', async () => {
    const ids = Array.from({ length: WEB_ITEMS_MAX_IDS + 1 }, (_, index) => `item-${index}`);
    mocks.webList.mockImplementation(async ({ query }: { query: WebListData['query'] }) =>
      ok(page((query.ids ?? '').split(',').map((id) => item(id))))
    );
    const { result } = renderHook(() => useItemsExport());

    await act(async () => {
      await result.current.exportSelection(ids);
    });

    expect(mocks.webList).toHaveBeenNthCalledWith(1, {
      query: {
        ids: ids.slice(0, WEB_ITEMS_MAX_IDS).join(','),
        includeInactive: true,
        limit: WEB_ITEMS_MAX_IDS,
      },
    });
    expect(mocks.webList).toHaveBeenNthCalledWith(2, {
      query: { ids: ids.at(-1), includeInactive: true, limit: WEB_ITEMS_MAX_IDS },
    });
    expect(downloadedCsv().indexOf('item-0')).toBeLessThan(
      downloadedCsv().indexOf(`item-${WEB_ITEMS_MAX_IDS}`)
    );
  });

  it('writes Where as the direct place or container name and blank in hand', async () => {
    setSources({
      worldItems: [
        rowModel('exported-container', 'World name'),
        rowModel('active-container', 'Active box'),
      ],
    });
    const rows = [
      item('located', { placement: { kind: 'location', locationId: 'garage' } }),
      item('hand', { placement: { kind: 'hand' } }),
      item('inside-exported', {
        placement: { kind: 'container', itemId: 'exported-container' },
      }),
      item('exported-container', { name: 'Exported shelf', isContainer: true }),
      item('inside-active', { placement: { kind: 'container', itemId: 'active-container' } }),
    ];
    mocks.webList.mockResolvedValue(ok(page(rows)));
    const { result } = renderHook(() => useItemsExport());

    await act(async () => {
      await result.current.exportView(filters);
    });

    expect(mocks.webList).toHaveBeenCalledOnce();
    const lines = downloadedCsv().split('\r\n');
    expect(lines.find((line) => line.startsWith('located,'))).toBe('located,,1,,Garage,');
    expect(lines.find((line) => line.startsWith('hand,'))).toBe('hand,,1,,,');
    expect(lines.find((line) => line.startsWith('inside-exported,'))).toBe(
      'inside-exported,,1,,Exported shelf,'
    );
    expect(lines.find((line) => line.startsWith('inside-active,'))).toBe(
      'inside-active,,1,,Active box,'
    );
  });

  it('names a retired container that is not in the exported rows by fetching it', async () => {
    const child = item('child', { placement: { kind: 'container', itemId: 'retired-box' } });
    mocks.webList.mockImplementation(async ({ query }: { query: WebListData['query'] }) =>
      query.ids === 'retired-box'
        ? ok(page([item('retired-box', { name: 'Retired box', isContainer: true })]))
        : ok(page([child]))
    );
    const { result } = renderHook(() => useItemsExport());

    await act(async () => {
      await result.current.exportView(filters);
    });

    expect(mocks.webList).toHaveBeenNthCalledWith(2, {
      query: { ids: 'retired-box', includeInactive: true, limit: WEB_ITEMS_MAX_IDS },
    });
    expect(downloadedCsv()).toContain('child,,1,,Retired box,');
  });

  it('writes a blank Where for an unresolved container id', async () => {
    const child = item('child', { placement: { kind: 'container', itemId: 'missing-box' } });
    mocks.webList.mockImplementation(async ({ query }: { query: WebListData['query'] }) =>
      query.ids === 'missing-box' ? ok(page([])) : ok(page([child]))
    );
    const { result } = renderHook(() => useItemsExport());

    await act(async () => {
      await result.current.exportView(filters);
    });

    expect(downloadedCsv()).toContain('child,,1,,,');
  });

  it('exports a computed field as its shown calculated or overridden value', async () => {
    const stored = field('type-tools', 'stored-field', 'Stored field', 'stored');
    const computed = field('type-tools', 'computed-field', 'Computed field', 'computed', 1);
    const type = catalogueType('type-tools', 'Tools', [stored, computed]);
    setSources({ types: [type] });
    mocks.webList.mockResolvedValue(
      ok(
        page([
          item('calculated', {
            typeId: type.id,
            fieldValues: [storedValue(stored.id, ['wood'])],
            computedValues: [computedValue(computed.id, 'calculated')],
          }),
          item('overridden', {
            typeId: type.id,
            fieldValues: [
              storedValue(stored.id, ['metal']),
              overrideValue(computed.id, ['override']),
            ],
            computedValues: [overriddenValue(computed.id, 'override')],
          }),
          item('unavailable', {
            typeId: type.id,
            fieldValues: [storedValue(stored.id, ['plastic'])],
            computedValues: [unavailableValue(computed.id)],
          }),
          item('missing', { typeId: type.id }),
        ])
      )
    );
    const { result } = renderHook(() => useItemsExport());

    await act(async () => {
      await result.current.exportView(filters);
    });

    const lines = downloadedCsv().split('\r\n');
    expect(lines[0]).toBe('Name,Type,Quantity,Code,Where,Note,Stored field,Computed field');
    expect(lines.find((line) => line.startsWith('calculated,'))).toContain(',wood,calculated');
    expect(lines.find((line) => line.startsWith('overridden,'))).toContain(',metal,override');
    expect(lines.find((line) => line.startsWith('unavailable,'))).toContain(',plastic,');
    expect(lines.find((line) => line.startsWith('overridden,'))).not.toContain('override,override');
    expect(lines.find((line) => line.startsWith('missing,'))).toBe('missing,Tools,1,,Garage,,,');
  });

  it('exports inherited fields before the child fields', async () => {
    const inherited = field('type-bedding', 'material', 'Material', 'stored');
    const local = field('type-sheet', 'fitted', 'Fitted', 'stored', 1);
    const parent = catalogueType('type-bedding', 'Bedding', [inherited]);
    const child = catalogueType('type-sheet', 'Sheet', [local], parent.id);
    setSources({ types: [parent, child] });
    mocks.webList.mockResolvedValue(
      ok(
        page([
          item('sheet', {
            typeId: child.id,
            typeKey: child.key,
            fieldValues: [storedValue(inherited.id, ['cotton']), storedValue(local.id, ['yes'])],
          }),
        ])
      )
    );
    const { result } = renderHook(() => useItemsExport());

    await act(async () => {
      await result.current.exportView(filters);
    });

    const lines = downloadedCsv().split('\r\n');
    expect(lines[0]).toBe('Name,Type,Quantity,Code,Where,Note,Material,Fitted');
    expect(lines[1]).toBe('sheet,Sheet,1,,Garage,,cotton,yes');
  });

  it('downloads nothing and reports a failed page request', async () => {
    mocks.webList.mockRejectedValue(new Error('network failure'));
    const { result } = renderHook(() => useItemsExport());

    await act(async () => {
      await result.current.exportView(filters);
    });

    expect(csv.downloadCsv).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Export failed. Nothing was downloaded.');
  });

  it('downloads nothing when a fallback container-name request fails', async () => {
    const child = item('child', { placement: { kind: 'container', itemId: 'retired-box' } });
    mocks.webList.mockImplementation(async ({ query }: { query: WebListData['query'] }) => {
      if (query.ids === 'retired-box') throw new Error('name lookup failure');
      return ok(page([child]));
    });
    const { result } = renderHook(() => useItemsExport());

    await act(async () => {
      await result.current.exportView(filters);
    });

    expect(csv.downloadCsv).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Export failed. Nothing was downloaded.');
  });

  it('is busy while placement names are loading and does not start an export', async () => {
    setSources({ isLoading: true });
    const { result } = renderHook(() => useItemsExport());

    expect(result.current.busy).toBe(true);
    await act(async () => {
      await result.current.exportSelection(['item-1']);
    });

    expect(mocks.webList).not.toHaveBeenCalled();
    expect(csv.downloadCsv).not.toHaveBeenCalled();
  });
});
