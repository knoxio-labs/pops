import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';

import { InventoryPage } from '../../foundation/frame/page-frame.js';
import { SelectionBar } from '../../foundation/selection/selection-bar.js';
import { SearchBar } from './search-bar.js';
import { SearchBody } from './search-body.js';
import { SearchOverlay } from './search-overlay.js';
import { SearchPreview } from './search-preview.js';
import { useSearchPage } from './use-search-page.js';

function useWideLayout(): boolean {
  const [wide, setWide] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(min-width: 1024px)');
    const update = (): void => setWide(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return wide;
}

/** Renders the inventory search route with URL-owned filters and a responsive preview. */
export function SearchPage() {
  const state = useSearchPage();
  const wide = useWideLayout();
  const preview = <SearchPreview state={state} />;

  return (
    <InventoryPage
      title="Search"
      icon={Search}
      toolbar={
        <SearchBar
          query={state.query}
          scope={state.scope}
          counts={state.counts}
          filters={{ typeKey: state.typeKey, within: state.within }}
          typeOptions={state.typeOptions}
          placementOptions={state.placementOptions}
          onQueryChange={state.setQuery}
          onScopeChange={state.setScope}
          onFiltersChange={state.setFilters}
        />
      }
      dock={
        <SelectionBar
          count={state.selection.count}
          loadedCount={state.itemOrder.length}
          coverage={state.selection.coverage}
          actions={state.selectionActions}
          onSelectAll={state.selection.onHeaderToggle}
          onClear={state.selection.clearSelection}
        />
      }
      overlay={<SearchOverlay state={state} wide={wide} />}
      bodyClassName="min-h-0"
    >
      <div className="flex min-h-0 flex-1 gap-4">
        <div className="flex min-w-0 flex-1 flex-col">
          <SearchBody state={state} />
        </div>
        <div className="hidden min-h-0 overflow-hidden rounded-xl border bg-card lg:flex lg:w-2/5 lg:flex-col xl:w-1/3">
          {preview}
        </div>
      </div>
    </InventoryPage>
  );
}
