import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ItemsContent } from './ItemsContent';

import type { ItemsListResponse } from '../../inventory-api/types.gen.js';

type InventoryItem = ItemsListResponse['data'][number];

const baseItem: InventoryItem = {
  assetId: null,
  brand: null,
  condition: null,
  containerId: null,
  deductible: false,
  id: 'item-1',
  inUse: true,
  itemId: null,
  itemName: 'MacBook Pro',
  lastEditedTime: '2026-01-01T00:00:00.000Z',
  location: 'Legacy free-text shelf',
  locationId: 'loc-shelf',
  model: null,
  notes: null,
  purchaseDate: null,
  purchasePrice: null,
  purchaseTransactionId: null,
  purchasedFromId: null,
  purchasedFromName: null,
  replacementValue: null,
  resaleValue: null,
  room: null,
  type: null,
  warrantyExpires: null,
};

const noop = vi.fn();

describe('ItemsContent — grid view location resolution', () => {
  it('resolves the location breadcrumb from locationPathMap, same as the table', () => {
    const locationPathMap = new Map([
      [
        'loc-shelf',
        [
          { id: 'loc-home', name: 'Home' },
          { id: 'loc-living', name: 'Living Room' },
        ],
      ],
    ]);

    render(
      <ItemsContent
        isLoading={false}
        items={[baseItem]}
        viewMode="grid"
        hasSearchOrFilters={false}
        locationPathMap={locationPathMap}
        onOpen={noop}
        onEdit={noop}
        onDeleteRequest={noop}
      />
    );

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Living Room')).toBeInTheDocument();
    expect(screen.queryByText('Legacy free-text shelf')).not.toBeInTheDocument();
  });

  it('falls back to the legacy location string when locationPathMap has no entry', () => {
    render(
      <ItemsContent
        isLoading={false}
        items={[baseItem]}
        viewMode="grid"
        hasSearchOrFilters={false}
        locationPathMap={new Map()}
        onOpen={noop}
        onEdit={noop}
        onDeleteRequest={noop}
      />
    );

    expect(screen.getByText('Legacy free-text shelf')).toBeInTheDocument();
  });
});
