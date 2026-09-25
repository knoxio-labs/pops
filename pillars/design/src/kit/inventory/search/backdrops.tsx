/**
 * Pages the overlay screens (TopBar search, palette) are drawn over, so a
 * reviewer sees each overlay in the context it opens from.
 */
import { ItemsPage } from '../items-list/items-page';
import { SearchPage } from './search-page';

import type { ReactNode } from 'react';

import type { ItemsPageProps } from '../items-list/items-page';
import type { SearchPageProps } from './search-page';

/** The Items page with an overlay on top. */
export function OverItems({ page, overlay }: { page: ItemsPageProps; overlay: ReactNode }) {
  return (
    <>
      <ItemsPage {...page} />
      {overlay}
    </>
  );
}

/** The Search page with an overlay on top. */
export function OverSearch({ page, overlay }: { page: SearchPageProps; overlay: ReactNode }) {
  return (
    <>
      <SearchPage {...page} />
      {overlay}
    </>
  );
}
