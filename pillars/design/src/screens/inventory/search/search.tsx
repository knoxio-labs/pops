import { browseWorld, placeOptions, typeOptions } from '@/fixtures/inventory/items-browse';
import { purchaseResults } from '@/fixtures/inventory/purchases-results';
import {
  SEARCH_QUERIES as Q,
  searchRecentQueries,
  searchRecentRecords,
} from '@/fixtures/inventory/search-results';
import { searchInventory } from '@/kit/inventory/search/search-model';
import { SearchPage } from '@/kit/inventory/search/search-page';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { SearchPageProps } from '@/kit/inventory/search/search-page';
import type { ReactNode } from 'react';

const hdmiPicks = searchInventory(browseWorld, 'hdmi')
  .items.slice(0, 5)
  .filter((_, index) => index % 2 === 0)
  .map((hit) => hit.item.id);

export const meta: ScreenMeta = { title: 'Search', order: 90, frame: 'web' };

function Search(props: Partial<SearchPageProps>): ReactNode {
  return (
    <SearchPage
      world={browseWorld}
      purchases={purchaseResults}
      types={typeOptions}
      places={placeOptions}
      recentQueries={searchRecentQueries}
      recentRecords={searchRecentRecords}
      {...props}
    />
  );
}

/**
 * `/inventory/search?q=`: the TopBar box's Enter and the palette's "See all
 * results" land here. Ranking follows iOS universal search: an exact code
 * first, then name prefix, name contains, other fields and places.
 * `?code=K12` skips this page and opens the item.
 */
export const states: ScreenStates = {
  results: () => <Search seed={{ query: Q.results }} />,
  'code-exact': () => <Search seed={{ query: Q.exactCode }} />,
  'preview-item': () => <Search seed={{ query: 'hdmi', activeId: 'itm-hdmi' }} />,
  'preview-container': () => <Search seed={{ query: Q.container, activeId: 'box-k13' }} />,
  'preview-location': () => <Search seed={{ query: Q.place, activeId: 'loc-garage' }} />,
  'preview-purchase': () => (
    <Search seed={{ query: Q.purchase, scope: 'purchases', activeId: 'po-1203' }} />
  ),
  filtered: () => (
    <Search seed={{ query: Q.results, filters: { typeId: 'type-cable', within: 'loc-garage' } }} />
  ),
  selected: () => (
    <Search
      seed={{
        query: 'hdmi',
        activeId: hdmiPicks[1],
        selected: hdmiPicks,
      }}
    />
  ),
  'no-results': () => <Search seed={{ query: Q.none }} />,
  'no-results-filtered': () => (
    <Search seed={{ query: 'drill', filters: { typeId: 'type-kitchen' } }} />
  ),
  recents: () => <Search />,
  tablet: () => <Search narrow seed={{ query: 'hdmi', activeId: 'itm-hdmi' }} />,
};

export default function SearchScreen(): ReactNode {
  return <Search seed={{ query: Q.results }} />;
}
