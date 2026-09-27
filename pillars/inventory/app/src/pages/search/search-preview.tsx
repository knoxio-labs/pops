import { useMemo } from 'react';
import { useNavigate } from 'react-router';

import { ActivePreview } from './active-preview.js';

import type { SearchPageState } from './use-search-page.js';

/** Renders the active item, place, or purchase preview from URL-owned state. */
export function SearchPreview({ state }: { readonly state: SearchPageState }) {
  const navigate = useNavigate();
  const activeItem = useMemo(() => {
    if (state.activeId === null) return null;
    const worldItem = state.world.items.get(state.activeId);
    if (worldItem !== undefined) return worldItem;
    if (state.inventory.results.exact?.id === state.activeId) return state.inventory.results.exact;
    return (
      state.inventory.results.items.find((hit) => hit.item.id === state.activeId)?.item ?? null
    );
  }, [state.activeId, state.inventory.results, state.world.items]);
  const activePlace = useMemo(
    () => (state.activeId === null ? null : (state.world.locations.get(state.activeId) ?? null)),
    [state.activeId, state.world.locations]
  );
  return (
    <ActivePreview
      scope={state.scope}
      activeId={state.activeId}
      item={activeItem}
      place={activePlace}
      world={state.world}
      onOpen={() => {
        if (activeItem !== null) state.openResult(activeItem.id);
      }}
      onPickUp={() => {
        if (activeItem !== null) state.pickUp(activeItem.id);
      }}
      onPutBack={() => {
        if (activeItem !== null) state.putBack(activeItem.id);
      }}
      onMove={() => {
        if (activeItem !== null) state.openMoveFor(activeItem.id);
      }}
      onOpenPlace={() => {
        if (activePlace !== null) state.openResult(activePlace.id);
      }}
      onStoreHere={() => {
        if (activePlace !== null) {
          void navigate(`/inventory/items?placement=${encodeURIComponent(activePlace.id)}`);
        }
      }}
      onOpenPurchase={() => {
        if (state.activeId !== null) state.openResult(state.activeId);
      }}
    />
  );
}
