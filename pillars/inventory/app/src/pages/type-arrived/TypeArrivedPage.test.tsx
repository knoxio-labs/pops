import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model.js';
import { ShortcutProvider } from '../../foundation/shortcuts/shortcut-provider.js';
import { TypeArrivedPage } from './TypeArrivedPage.js';

import type { RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';

import type { ItemRowModel } from '../../foundation/model/model.js';
import type { WebListResponses } from '../../inventory-api/types.gen.js';
import type { CatalogueLookups, CatalogueType } from '../../inventory-web/useCatalogueLookups.js';

const mocks = vi.hoisted(() => ({
  usePublishedCatalogue: vi.fn(),
  useCatalogueLookups: vi.fn(),
  useWebItems: vi.fn(),
  usePlacementSources: vi.fn(),
  useBulkItemVerbs: vi.fn(),
  dismissType: vi.fn(),
  showUndoToast: vi.fn(),
}));

vi.mock('../../inventory-web/useCatalogueLookups.js', () => ({
  usePublishedCatalogue: mocks.usePublishedCatalogue,
  useCatalogueLookups: mocks.useCatalogueLookups,
}));
vi.mock('../../inventory-web/useWebItems.js', () => ({ useWebItems: mocks.useWebItems }));
vi.mock('../../inventory-web/usePlacementSources.js', () => ({
  usePlacementSources: mocks.usePlacementSources,
}));
vi.mock('../../inventory-web/item-verbs-bulk.js', () => ({
  useBulkItemVerbs: mocks.useBulkItemVerbs,
}));
vi.mock('../../inventory-web/type-arrivals.js', () => ({ dismissType: mocks.dismissType }));
vi.mock('../../foundation/feedback/undo-toast.js', () => ({
  showUndoToast: mocks.showUndoToast,
}));

type WebItem = WebListResponses['200']['items'][number];
type WebPage = WebListResponses['200'];

const location = { id: 'room', name: 'Room', parentId: null, kind: 'room' as const };

const arrivedType: CatalogueType = {
  archivedAt: null,
  capabilities: [],
  description: null,
  fields: [],
  id: 'type-garden',
  key: 'garden',
  label: 'Garden tools',
  legacyLabels: ['Garden', 'Workshop'],
  presentation: {},
  replacedBy: null,
  revision: 8,
  sortOrder: 0,
};

function webItem(id: string, name: string, legacyType: string): WebItem {
  return {
    access: null,
    catalogueRevision: 8,
    code: null,
    computedValues: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    documentTitles: [],
    documentsStatus: 'none',
    externalIds: [],
    fieldValues: [],
    fields: {},
    id,
    isContainer: false,
    isFull: null,
    legacyType,
    lifecycle: 'active',
    lifecycleChangedAt: null,
    name,
    note: null,
    photos: [],
    placement: { kind: 'location', locationId: location.id },
    previousPlacement: null,
    provenance: null,
    quantity: 1,
    revision: 1,
    seq: Number(id.replace('item-', '')),
    typeId: null,
    typeKey: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const items = [webItem('item-1', 'Shears', 'Garden'), webItem('item-2', 'Hose', 'Workshop')];

function page(pageItems: readonly WebItem[] = items, nextCursor: string | null = null): WebPage {
  return {
    contentCounts: {},
    hiddenInactiveCount: 0,
    items: [...pageItems],
    nextCursor,
    total: pageItems.length,
    unfilteredTotal: pageItems.length,
  };
}

function row(item: WebItem): ItemRowModel {
  return {
    id: item.id,
    name: item.name,
    typeId: item.typeId,
    typeName: null,
    code: item.code,
    quantity: item.quantity,
    container: null,
    lifecycle: 'active',
    placement: { kind: 'location', locationId: location.id },
    previous: null,
    sync: 'synced',
    photoUrl: null,
    note: null,
    updatedAt: item.updatedAt,
  };
}

function catalogueLookups(): CatalogueLookups {
  return {
    catalogue: undefined,
    types: [arrivedType],
    baseRevision: null,
    typeById: new Map([[arrivedType.id, arrivedType]]),
    typeNameById: new Map([[arrivedType.id, arrivedType.label]]),
    typeForId: (id) => (id === arrivedType.id ? arrivedType : null),
    typeNameForId: (id) => (id === arrivedType.id ? arrivedType.label : null),
    isPending: false,
    error: null,
    refetch: vi.fn(),
    revision: 8,
    status: 'success',
  };
}

function publishedCatalogue(types: readonly CatalogueType[] = [arrivedType]) {
  return {
    catalogue: undefined,
    types,
    baseRevision: null,
    typeById: new Map(types.map((type) => [type.id, type] as const)),
    typeNameById: new Map(types.map((type) => [type.id, type.label] as const)),
    typeForId: (id: string | null | undefined) =>
      id === null || id === undefined ? null : (types.find((type) => type.id === id) ?? null),
    typeNameForId: (id: string | null | undefined) =>
      id === null || id === undefined
        ? null
        : (types.find((type) => type.id === id)?.label ?? null),
    isPending: false,
    error: null,
    refetch: vi.fn(),
    revision: 8,
    status: 'success',
  };
}

interface WebItemsState {
  data: { pages: readonly WebPage[] };
  status: 'success' | 'pending' | 'error';
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  refetch: () => Promise<unknown>;
}

function webItemsResult(overrides: Partial<WebItemsState> = {}): WebItemsState {
  return {
    data: { pages: [page()] },
    status: 'success' as const,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function LocationProbe(): ReactElement {
  return <output data-testid="location">{useLocation().pathname + useLocation().search}</output>;
}

function pageElement(): ReactElement {
  return (
    <MemoryRouter initialEntries={['/inventory/types/type-garden/arrived']}>
      <ShortcutProvider globalHandlers={{}}>
        <Routes>
          <Route path="/inventory/types/:id/arrived" element={<TypeArrivedPage />} />
        </Routes>
        <LocationProbe />
      </ShortcutProvider>
    </MemoryRouter>
  );
}

function renderPage(): RenderResult {
  return render(pageElement());
}

let currentWebItems = webItemsResult();
let changeType: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  currentWebItems = webItemsResult();
  changeType = vi.fn().mockResolvedValue({
    applied: ['item-1'],
    refused: [{ id: 'item-2', refusal: { kind: 'conflict' } }],
    undo: vi.fn().mockResolvedValue(undefined),
  });
  mocks.usePublishedCatalogue.mockReturnValue(publishedCatalogue());
  mocks.useCatalogueLookups.mockReturnValue(catalogueLookups());
  mocks.useWebItems.mockImplementation(() => currentWebItems);
  mocks.usePlacementSources.mockReturnValue({
    world: buildWorld(items.map(row), [location]),
    isLoading: false,
    isError: false,
  });
  mocks.useBulkItemVerbs.mockReturnValue({ changeType });
});

describe('TypeArrivedPage', () => {
  it('ticks every match and Apply counts the ticked ones', async () => {
    renderPage();

    expect(await screen.findByRole('button', { name: /Apply to 2/u })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Type Shears as this type' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Type Hose as this type' })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Type Hose as this type' }));
    expect(screen.getByRole('button', { name: /Apply to 1/u })).toBeInTheDocument();
  });

  it("names each match's place with PlaceName in the Where column", async () => {
    renderPage();

    await screen.findByRole('button', { name: /Apply to 2/u });
    expect(screen.getAllByText('Room')).toHaveLength(2);
  });

  it('Apply sends changeType for the ticked ids only and offers one Undo', async () => {
    renderPage();

    await screen.findByRole('button', { name: /Apply to 2/u });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Type Hose as this type' }));
    fireEvent.click(screen.getByRole('button', { name: /Apply to 1/u }));

    await waitFor(() => expect(changeType).toHaveBeenCalledWith(['item-1'], 'garden'));
    expect(mocks.dismissType).toHaveBeenCalledWith('type-garden');
    expect(mocks.showUndoToast).toHaveBeenCalledTimes(1);
    expect(mocks.showUndoToast).toHaveBeenCalledWith(
      expect.objectContaining({
        concept: 'type',
        message: 'Typed 1 item as Garden tools',
        onUndo: expect.any(Function),
      })
    );
    const list = within(screen.getByRole('grid', { name: 'Matched items' }));
    expect(list.getByText('Garden tools')).toBeInTheDocument();
    expect(list.getByText('Workshop')).toBeInTheDocument();
  });

  it('Mod+Enter applies while reviewing', async () => {
    renderPage();
    await screen.findByRole('button', { name: /Apply to 2/u });

    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    await waitFor(() => expect(changeType).toHaveBeenCalledWith(['item-1', 'item-2'], 'garden'));
  });

  it('Not now dismisses the type and offers the untyped items', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(await screen.findByText('2 items left untyped')).toBeInTheDocument();
    expect(mocks.dismissType).toHaveBeenCalledWith('type-garden');
    expect(screen.getByRole('button', { name: 'Open untyped items' })).toBeInTheDocument();
  });

  it('nothing matched offers Open {type}', async () => {
    currentWebItems = webItemsResult({ data: { pages: [page([])] } });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Open Garden tools' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/inventory/types/type-garden');
  });

  it('loads every page of matches before listing them', async () => {
    const firstItem = items[0];
    const secondItem = items[1];
    if (firstItem === undefined || secondItem === undefined) {
      throw new Error('test item fixture is incomplete');
    }
    const firstPage = page([firstItem], 'next');
    const secondPage = page([secondItem]);
    const fetchNextPage = vi.fn();
    currentWebItems = webItemsResult({
      data: { pages: [firstPage] },
      hasNextPage: true,
      fetchNextPage,
    });
    const view = renderPage();

    expect(screen.queryByRole('grid', { name: 'Matched items' })).not.toBeInTheDocument();
    await waitFor(() => expect(fetchNextPage).toHaveBeenCalledOnce());
    currentWebItems = webItemsResult({ data: { pages: [firstPage, secondPage] } });
    await act(async () => {
      view.rerender(pageElement());
    });
    expect(await screen.findByRole('button', { name: /Apply to 2/u })).toBeInTheDocument();
  });

  it('an unknown type id redirects to the type catalogue', async () => {
    mocks.usePublishedCatalogue.mockReturnValue(publishedCatalogue([]));
    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/inventory/types')
    );
  });
});
