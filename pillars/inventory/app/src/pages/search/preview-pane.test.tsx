const previousTimeZone = vi.hoisted(() => {
  const value = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
  return value;
});

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useItemRows: vi.fn(),
  useWebItemDetail: vi.fn(),
  usePurchasePreview: vi.fn(),
}));

vi.mock('../../inventory-web/useWebItems.js', () => ({ useItemRows: mocks.useItemRows }));
vi.mock('../../inventory-web/useWebItemDetail.js', () => ({
  useWebItemDetail: mocks.useWebItemDetail,
}));
vi.mock('../../inventory-web/usePurchasePreview.js', () => ({
  usePurchasePreview: mocks.usePurchasePreview,
}));

import { buildWorld } from '../../foundation/model/placement-model.js';
import { ItemPreview, type PreviewVerb } from './item-preview.js';
import { PlacePreview } from './place-preview.js';
import { PurchasePreview } from './purchase-preview.js';

import type { ItemRowModel, LocationModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { PurchaseResult } from '../../inventory-web/purchase-model.js';

afterAll(() => {
  if (previousTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = previousTimeZone;
});

afterEach(() => {
  cleanup();
});

function item(id: string, name: string, overrides: Partial<ItemRowModel> = {}): ItemRowModel {
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
    updatedAt: '2026-09-12T02:00:00.000Z',
    ...overrides,
  };
}

function place(id: string, name: string, parentId: string | null = null): LocationModel {
  return { id, name, parentId, kind: parentId === null ? 'property' : 'room' };
}

function rowsResult(
  rows: readonly ItemRowModel[],
  status: 'pending' | 'error' | 'success' = 'success',
  total: number | null = rows.length,
  refetch: () => void = vi.fn()
) {
  return {
    rows: [...rows],
    total,
    unfilteredTotal: total,
    hiddenInactiveCount: 0,
    baseline: total,
    hidden: 0,
    contentCounts: {},
    status,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch,
  };
}

function detailResult(
  provenance: { merchant: string | null; purchasedOn: string | null } | null,
  status: 'pending' | 'error' | 'success' = 'success'
) {
  return {
    status,
    data: status === 'success' ? { item: { provenance } } : undefined,
  };
}

function purchase(): PurchaseResult {
  return {
    id: 'po-1203',
    merchant: 'Kmart',
    orderNumber: 'po-1203',
    date: '2026-09-12T02:00:00.000Z',
    totalCents: 1200,
    lines: [
      { name: 'HDMI cable', quantity: 2, priceCents: 500, itemId: 'hdmi-1' },
      { name: 'Cable ties', quantity: 1, priceCents: 200 },
    ],
  };
}

const garage = place('garage', 'Garage');
const shelf = place('shelf', 'Shelf', garage.id);

let world: PlacementWorld;

beforeEach(() => {
  vi.clearAllMocks();
  world = buildWorld([], [garage, shelf]);
  mocks.useItemRows.mockReturnValue(rowsResult([]));
  mocks.useWebItemDetail.mockReturnValue(
    detailResult({ merchant: 'Kmart', purchasedOn: '2026-09-12' })
  );
  mocks.usePurchasePreview.mockReturnValue({
    status: 'success',
    purchase: purchase(),
    error: null,
  });
});

function renderItemPreview(
  itemModel: ItemRowModel,
  options: {
    onOpen?: () => void;
    onVerb?: (verb: PreviewVerb, anchor: HTMLElement) => void;
    disabledReason?: string;
  } = {}
) {
  const onOpen = options.onOpen ?? vi.fn();
  const onVerb = options.onVerb ?? vi.fn<(verb: PreviewVerb, anchor: HTMLElement) => void>();
  return render(
    <ItemPreview
      item={itemModel}
      world={world}
      onOpen={onOpen}
      onVerb={onVerb}
      disabledReason={options.disabledReason}
    />
  );
}

describe('search preview pane', () => {
  it('an item preview shows its facts with Bought from the provenance and calls onVerb for Pick up and Move', () => {
    const hdmi = item('hdmi-1', 'HDMI cable', {
      typeName: 'Cable',
      code: 'HDMI-1',
      placement: { kind: 'location', locationId: garage.id },
    });
    world = buildWorld([hdmi], [garage, shelf]);
    const onVerb = vi.fn<(verb: PreviewVerb, anchor: HTMLElement) => void>();

    renderItemPreview(hdmi, { onVerb });

    expect(screen.getByText('Kmart, 12 Sept 2026')).toBeInTheDocument();
    expect(screen.getByText('12 Sept 2026')).toBeInTheDocument();
    expect(screen.getAllByText('HDMI-1')).toHaveLength(2);

    const pickUp = screen.getByRole('button', { name: 'Pick up' });
    fireEvent.click(pickUp);
    expect(onVerb).toHaveBeenCalledWith('pick-up', pickUp);

    const move = screen.getByRole('button', { name: 'Move' });
    fireEvent.click(move);
    expect(onVerb).toHaveBeenCalledWith('move', move);
  });

  it('an unreadable purchase date shows its text and does not throw', () => {
    const hdmi = item('hdmi-1', 'HDMI cable');
    mocks.useWebItemDetail.mockReturnValue(
      detailResult({ merchant: 'Kmart', purchasedOn: 'last spring' })
    );

    expect(() => renderItemPreview(hdmi)).not.toThrow();
    expect(screen.getByText('Kmart, last spring')).toBeInTheDocument();
  });

  it('an item in hand offers Put back instead of Pick up', () => {
    const itemInHand = item('hdmi-1', 'HDMI cable', { placement: { kind: 'in-hand' } });

    renderItemPreview(itemInHand);

    expect(screen.getByRole('button', { name: 'Put back' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pick up' })).not.toBeInTheDocument();
  });

  it('an item with no provenance reads No linked purchase', () => {
    mocks.useWebItemDetail.mockReturnValue(detailResult(null));

    renderItemPreview(item('hdmi-1', 'HDMI cable'));

    expect(screen.getByText('No linked purchase')).toBeInTheDocument();
  });

  it('a container preview lists what is directly inside with its count', () => {
    const box = item('box-1', 'Kitchen 13', {
      container: { access: 'open', full: false },
      placement: { kind: 'location', locationId: shelf.id },
    });
    const cable = item('cable-1', 'USB-C cable', {
      placement: { kind: 'container', containerId: box.id },
    });
    const drill = item('drill-1', 'Cordless drill', {
      placement: { kind: 'container', containerId: box.id },
    });
    world = buildWorld([box, cable, drill], [garage, shelf]);
    mocks.useItemRows.mockReturnValue(rowsResult([cable, drill], 'success', 13));

    renderItemPreview(box);

    expect(screen.getByRole('heading', { name: /^Inside/ })).toBeInTheDocument();
    expect(screen.getByText('13')).toBeInTheDocument();
    expect(screen.getByText('USB-C cable')).toBeInTheDocument();
    expect(screen.getByText('Cordless drill')).toBeInTheDocument();
    expect(mocks.useItemRows).toHaveBeenCalledWith({ containingItemId: box.id }, 50);
  });

  it('an empty container preview shows its empty copy', () => {
    const box = item('box-1', 'Kitchen 13', {
      container: { access: 'open', full: false },
    });
    mocks.useItemRows.mockReturnValue(rowsResult([]));

    renderItemPreview(box);

    expect(screen.getByText('Empty. Store here from the container page.')).toBeInTheDocument();
  });

  it('a place preview lists what sits directly there and calls onStoreHere', () => {
    const cable = item('cable-1', 'USB-C cable', {
      placement: { kind: 'location', locationId: garage.id },
    });
    world = buildWorld([cable], [garage, shelf]);
    mocks.useItemRows.mockReturnValue(rowsResult([cable], 'success', 1));
    const onStoreHere = vi.fn();

    render(<PlacePreview place={garage} path="House" onOpen={vi.fn()} onStoreHere={onStoreHere} />);

    expect(screen.getByRole('heading', { name: /^Directly here/ })).toBeInTheDocument();
    expect(screen.getByText('USB-C cable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Open place/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Store here' }));
    expect(onStoreHere).toHaveBeenCalledOnce();
    expect(mocks.useItemRows).toHaveBeenCalledWith(
      { locationId: garage.id, placementKind: 'location' },
      50
    );
  });

  it('a loading list shows three skeleton rows', () => {
    const box = item('box-1', 'Kitchen 13', {
      container: { access: 'open', full: false },
    });
    mocks.useItemRows.mockReturnValue(rowsResult([], 'pending', null));

    const view = renderItemPreview(box);

    expect(view.container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
  });

  it('a failed list shows Retry, which refetches', () => {
    const box = item('box-1', 'Kitchen 13', {
      container: { access: 'open', full: false },
    });
    const refetch = vi.fn();
    mocks.useItemRows.mockReturnValue(rowsResult([], 'error', null, refetch));

    renderItemPreview(box);

    expect(screen.getByText('This list did not load.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('a purchase preview is read only, names the item a line became and calls onOpenInPurchases', () => {
    const tracked = item('hdmi-1', 'HDMI cable');
    mocks.useItemRows.mockReturnValue(rowsResult([tracked]));
    const onOpenInPurchases = vi.fn();

    render(
      <PurchasePreview purchaseId="po-1203" currency="AUD" onOpenInPurchases={onOpenInPurchases} />
    );

    expect(screen.getByRole('heading', { name: 'Kmart po-1203' })).toBeInTheDocument();
    expect(screen.getByText(/12 September 2026/)).toBeInTheDocument();
    expect(screen.getByText(/\$12\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Read only here/)).toBeInTheDocument();
    expect(screen.getByText('2 × HDMI cable')).toBeInTheDocument();
    expect(screen.getByText('Tracked as HDMI cable')).toBeInTheDocument();
    expect(screen.getByText('$10.00')).toBeInTheDocument();
    expect(mocks.useItemRows).toHaveBeenCalledWith({ ids: 'hdmi-1', includeInactive: true }, 1);

    fireEvent.click(screen.getByRole('button', { name: 'Open in Purchases' }));
    expect(onOpenInPurchases).toHaveBeenCalledOnce();
  });

  it('a failed purchase says it did not load and still offers Open in Purchases', () => {
    const onOpenInPurchases = vi.fn();
    mocks.usePurchasePreview.mockReturnValue({ status: 'error', purchase: null, error: {} });

    render(
      <PurchasePreview purchaseId="po-1203" currency="AUD" onOpenInPurchases={onOpenInPurchases} />
    );

    expect(screen.getByText('This purchase did not load.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open in Purchases' }));
    expect(onOpenInPurchases).toHaveBeenCalledOnce();
  });

  it('with a disabled reason the verbs do nothing and Open still opens', () => {
    const onOpen = vi.fn();
    const onVerb = vi.fn<(verb: PreviewVerb, anchor: HTMLElement) => void>();
    const hdmi = item('hdmi-1', 'HDMI cable', {
      placement: { kind: 'location', locationId: garage.id },
    });

    renderItemPreview(hdmi, {
      onOpen,
      onVerb,
      disabledReason: 'Unavailable while offline.',
    });

    const pickUp = screen.getByRole('button', { name: 'Pick up' });
    const move = screen.getByRole('button', { name: 'Move' });
    expect(pickUp).toHaveAttribute('aria-disabled', 'true');
    expect(move).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(pickUp);
    fireEvent.click(move);
    expect(onVerb).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Open/ }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('with a disabled reason Store here does nothing', () => {
    const onStoreHere = vi.fn();
    mocks.useItemRows.mockReturnValue(rowsResult([]));

    render(
      <PlacePreview
        place={garage}
        path=""
        onOpen={vi.fn()}
        onStoreHere={onStoreHere}
        disabledReason="Unavailable while offline."
      />
    );

    const storeHere = screen.getByRole('button', { name: 'Store here' });
    expect(storeHere).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(storeHere);
    expect(onStoreHere).not.toHaveBeenCalled();
  });
});
