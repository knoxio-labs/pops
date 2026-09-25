import { coreItem } from '@/fixtures/inventory/core';
import { coreLocations } from '@/fixtures/inventory/core';
import {
  arrivedType,
  boxedSelection,
  browseInventory,
  browseWorld,
  duplicatePair,
  itemsSelection,
  placeOptions,
  typeOptions,
} from '@/fixtures/inventory/items-browse';
import { buildWorld, StateBanner } from '@/kit/inventory/foundation';
import { BulkMoveSheet, BulkSetFieldSheet } from '@/kit/inventory/items-list/bulk-sheets';
import { DuplicatesBanner, TypeArrivedBanner } from '@/kit/inventory/items-list/items-banners';
import { ItemsPage } from '@/kit/inventory/items-list/items-page';
import { PageOverlay } from '@/kit/inventory/items-list/page-overlay';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { ItemsPageProps } from '@/kit/inventory/items-list/items-page';
import type { ReactNode } from 'react';

export const meta: ScreenMeta = { title: 'Items', order: 10, frame: 'web' };

const RECENT = { sort: 'updated' as const };

function Items(props: Partial<ItemsPageProps>): ReactNode {
  return (
    <ItemsPage
      items={browseInventory}
      world={browseWorld}
      types={typeOptions}
      places={placeOptions}
      {...props}
    />
  );
}

const duplicatesWorld = buildWorld([...duplicatePair, ...browseInventory], coreLocations);

/**
 * `/inventory/items`: every tracked thing. Filters, sort and view live in
 * the URL (no saved searches, owner decision 6). The selection bar carries
 * Print labels, which opens the labels page with the selection (owner
 * decision 1); Retire and Discard sit under More.
 */
export const states: ScreenStates = {
  cards: () => <Items seed={{ view: 'cards', filters: RECENT }} />,
  compact: () => <Items seed={{ view: 'compact' }} />,
  filtered: () => (
    <Items seed={{ filters: { typeId: 'type-cable', within: 'loc-garage', q: '' } }} />
  ),
  'filter-open': () => <Items seed={{ filters: { typeId: 'type-cable' } }} filterOpen />,
  selected: () => (
    <Items
      seed={{ filters: RECENT, selected: itemsSelection, focusedId: 'itm-tv' }}
      pendingIds={new Set(['itm-tape'])}
    />
  ),
  'selected-in-boxes': () => (
    <Items seed={{ filters: { ...RECENT, within: 'loc-kitchen' }, selected: boxedSelection }} />
  ),
  'bulk-move-preview': () => (
    <Items
      seed={{ filters: RECENT, selected: itemsSelection }}
      overlay={
        <PageOverlay align="right">
          <BulkMoveSheet
            world={browseWorld}
            ids={itemsSelection}
            target={{ kind: 'location', locationId: 'loc-shelving' }}
          />
        </PageOverlay>
      }
    />
  ),
  'bulk-set-field': () => (
    <Items
      seed={{
        filters: { typeId: 'type-electronics' },
        selected: ['itm-tv', 'itm-router', 'itm-lamp', 'itm-soundbar'],
      }}
      overlay={
        <PageOverlay align="right">
          <BulkSetFieldSheet
            count={4}
            value="LG"
            fields={[
              { key: 'manufacturer', label: 'Manufacturer', have: 4 },
              { key: 'powered', label: 'Needs power', have: 4 },
              { key: 'brand', label: 'Brand', have: 0 },
            ]}
          />
        </PageOverlay>
      }
    />
  ),
  'type-arrived-banner': () => (
    <Items
      seed={{ filters: { untyped: true } }}
      banner={
        <TypeArrivedBanner
          typeLabel={arrivedType.label}
          matches={arrivedType.matchCount}
          publishedBy={arrivedType.publishedBy}
        />
      }
    />
  ),
  'collision-banner': () => (
    <Items
      items={[...duplicatePair, ...browseInventory]}
      world={duplicatesWorld}
      seed={{ filters: { q: 'extension' } }}
      banner={<DuplicatesBanner name={duplicatePair[0].name} place="Garage › Shelving" />}
    />
  ),
  'export-menu': () => (
    <Items seed={{ filters: RECENT, selected: [coreItem('itm-tv').id] }} exportOpen />
  ),
  empty: () => <Items items={[]} />,
  'empty-filtered': () => <Items seed={{ filters: { q: 'snorkel' } }} />,
  loading: () => <Items status="loading" />,
  error: () => <Items status="error" />,
  offline: () => <Items offline seed={{ filters: RECENT, selected: ['itm-tv', 'box-k13'] }} />,
  stale: () => (
    <Items
      seed={{ filters: RECENT, selected: ['itm-tv', 'box-k13'] }}
      banner={
        <StateBanner
          kind="stale"
          title="14 items changed elsewhere since this list loaded"
          detail="The list stays as it is while you select. Reload to see the changes."
          actionLabel="Reload"
        />
      }
    />
  ),
};

export default function ItemsScreen(): ReactNode {
  return <Items />;
}
