import {
  browseInventory,
  browseWorld,
  placeOptions,
  typeOptions,
} from '@/fixtures/inventory/items-browse';
import { purchaseResults } from '@/fixtures/inventory/purchases-results';
import { searchRecentQueries, searchRecentRecords } from '@/fixtures/inventory/search-results';
import { OverItems } from '@/kit/inventory/search/backdrops';
import { searchPurchases } from '@/kit/inventory/search/purchase-model';
import { resultCount, searchInventory } from '@/kit/inventory/search/search-model';
import { TopbarSearch } from '@/kit/inventory/search/topbar-search';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { SearchScope } from '@/kit/inventory/search/search-bar';
import type { ReactNode } from 'react';

export const meta: ScreenMeta = { title: 'TopBar search', order: 13, frame: 'web' };

function Open({ query, scope = 'inventory' }: { query: string; scope?: SearchScope }): ReactNode {
  const results = searchInventory(browseWorld, query);
  const purchases = searchPurchases(purchaseResults, query);
  return (
    <OverItems
      page={{
        items: browseInventory,
        world: browseWorld,
        types: typeOptions,
        places: placeOptions,
      }}
      overlay={
        <TopbarSearch
          query={query}
          scope={scope}
          world={browseWorld}
          results={results}
          purchases={purchases}
          recentQueries={searchRecentQueries}
          recentRecords={searchRecentRecords}
          total={{ inventory: resultCount(results), purchases: purchases.length }}
        />
      }
    />
  );
}

/**
 * The persistent TopBar box, focused with `/`. It finds; Cmd-K acts. The
 * dropdown is always the first rows of the results page, and Enter opens
 * that page with the query.
 */
export const states: ScreenStates = {
  typeahead: () => <Open query="cable" />,
  'code-exact': () => <Open query="k12" />,
  'scoped-purchases': () => <Open query="cable" scope="purchases" />,
  'no-results': () => <Open query="snorkel" />,
  recents: () => <Open query="" />,
};

export default function TopbarSearchScreen(): ReactNode {
  return <Open query="cable" />;
}
