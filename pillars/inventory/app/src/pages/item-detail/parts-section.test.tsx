import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { partWhere } from './parts-model';
import { PartsSection } from './parts-section';

import type { ReactElement } from 'react';

import type { ItemParts } from '../../inventory-api/index.js';

const mocks = vi.hoisted(() => ({
  itemsGetParts: vi.fn(),
  itemsAddPart: vi.fn(),
  itemsRemovePart: vi.fn(),
}));

vi.mock('../../components/AddPartDialog', () => ({
  AddPartDialog: ({ trigger }: { trigger: ReactElement }) => trigger,
}));
vi.mock('../../inventory-api/index.js', () => mocks);

function ok(data: ItemParts) {
  return { data: { data }, response: new Response(null, { status: 200 }) };
}

const kit: ItemParts = {
  canHaveParts: true,
  assembly: null,
  parts: [
    {
      itemId: 'cup',
      name: 'Blender cup',
      code: 'CUP-1',
      typeId: 'cup-type',
      lifecycle: 'active',
      placement: {
        kind: 'container',
        locationId: null,
        locationName: null,
        containingItemId: 'box',
        containingItemName: 'Box 3',
      },
    },
    {
      itemId: 'base',
      name: 'Motor base',
      code: null,
      typeId: null,
      lifecycle: 'active',
      placement: {
        kind: 'location',
        locationId: 'kitchen',
        locationName: 'Kitchen',
        containingItemId: null,
        containingItemName: null,
      },
    },
  ],
};

function renderSection(view: ItemParts, readOnly = false) {
  mocks.itemsGetParts.mockResolvedValue(ok(view));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PartsSection itemId="kit" readOnly={readOnly} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PartsSection', () => {
  it('lists each part linked, with its code and where it is', async () => {
    renderSection(kit);

    const cup = await screen.findByRole('link', { name: 'Blender cup' });
    expect(cup).toHaveAttribute('href', '/inventory/items/cup');
    expect(screen.getByText('CUP-1')).toBeInTheDocument();
    expect(screen.getByText('In Box 3')).toBeInTheDocument();
    expect(screen.getByText('Kitchen')).toBeInTheDocument();
    expect(mocks.itemsGetParts).toHaveBeenCalledWith({ path: { itemId: 'kit' } });
  });

  it('renders nothing for an item that is neither an assembly nor a part', async () => {
    const { container } = renderSection({ canHaveParts: false, assembly: null, parts: [] });

    await waitFor(() => expect(mocks.itemsGetParts).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('offers an empty assembly a way to add its first part', async () => {
    renderSection({ canHaveParts: true, assembly: null, parts: [] });

    expect(await screen.findByText('No parts listed yet.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Add part/ }).length).toBeGreaterThan(0);
  });

  it('links a part to the assembly it belongs to', async () => {
    renderSection({
      canHaveParts: false,
      assembly: { itemId: 'kit-1', name: 'Ninja kit', code: null },
      parts: [],
    });

    const link = await screen.findByRole('link', { name: 'Ninja kit' });
    expect(link).toHaveAttribute('href', '/inventory/items/kit-1');
    expect(screen.getByText(/Part of/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Parts' })).toBeNull();
  });

  it('removes a part through the client and refetches', async () => {
    mocks.itemsRemovePart.mockResolvedValue(ok({ ...kit, parts: kit.parts.slice(1) }));
    renderSection(kit);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Remove Blender cup from parts' })
    );

    await waitFor(() =>
      expect(mocks.itemsRemovePart).toHaveBeenCalledWith({
        path: { itemId: 'kit', partItemId: 'cup' },
      })
    );
    await waitFor(() => expect(mocks.itemsGetParts).toHaveBeenCalledTimes(2));
  });

  it('does not remove a part from a read-only item', async () => {
    renderSection(kit, true);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Remove Blender cup from parts' })
    );

    expect(mocks.itemsRemovePart).not.toHaveBeenCalled();
  });
});

describe('partWhere', () => {
  it('says in hand when the part has no place', () => {
    expect(
      partWhere({
        kind: 'hand',
        locationId: null,
        locationName: null,
        containingItemId: null,
        containingItemName: null,
      })
    ).toBe('In hand');
  });
});
