/**
 * No results: where search looked, what narrowed it, and the one step that
 * could help (the other scope when it has hits, else clearing filters).
 */
import { SearchX } from 'lucide-react';

import { Button, EmptyState } from '@pops/ui';

import { KeyCombo } from '../foundation';
import { resultCount, searchInventory } from './search-model';

import type { ReactNode } from 'react';

import type { PlacementWorld } from '../foundation';
import type { SearchScope } from './search-bar';
import type { SearchPageState } from './use-search-page';

function describe(otherCount: number, other: SearchScope, unfiltered: number): ReactNode {
  if (otherCount > 0) {
    return (
      <>
        {`${String(otherCount)} in ${other === 'inventory' ? 'Inventory' : 'Purchases'}. Press `}
        <KeyCombo sequence={['Tab']} /> to switch.
      </>
    );
  }
  if (unfiltered > 0) return `${String(unfiltered)} match without the Type and Placement filters.`;
  return 'Search matches names, codes, notes, types and places. Retired items are included.';
}

/** The empty result. */
export function SearchEmpty({ page, world }: { page: SearchPageState; world: PlacementWorld }) {
  const here = page.scope === 'inventory' ? 'Inventory' : 'Purchases';
  const other: SearchScope = page.scope === 'inventory' ? 'purchases' : 'inventory';
  const otherCount = page.counts[other];
  const filtered =
    page.scope === 'inventory' && (page.filters.typeId !== null || page.filters.within !== null);
  const unfiltered = filtered ? resultCount(searchInventory(world, page.query)) : 0;
  const description = describe(otherCount, other, unfiltered);
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <EmptyState
        icon={SearchX}
        size="sm"
        title={`Nothing in ${here} matches “${page.query.trim()}”`}
        description={description}
        action={
          unfiltered > 0 && otherCount === 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => page.setFilters({ typeId: null, within: null })}
            >
              Clear filters
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}
