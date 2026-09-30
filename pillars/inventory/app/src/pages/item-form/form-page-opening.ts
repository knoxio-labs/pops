import { createOpening, duplicateOpening, editOpening } from './form-opening';

import type { ItemFormOpening } from './form-opening';
import type { FormSources } from './use-form-sources';

/** Picks the edit, duplicate or blank create opening once the form sources have loaded. */
export function openingFor(
  id: string | undefined,
  search: string,
  sources: FormSources
): ItemFormOpening {
  if (sources.item !== null && sources.catalogue !== undefined)
    return id === undefined
      ? duplicateOpening(sources.item, sources.catalogue, sources.world)
      : editOpening(sources.item, sources.catalogue, sources.world);
  return createOpening(new URLSearchParams(search), sources.world, sources.catalogue);
}

/** Names what failed to load for the route being opened. */
export function loadErrorCopy(
  id: string | undefined,
  sourceId: string | undefined,
  sources: FormSources
): { readonly title: string; readonly subject: string } {
  if (id === undefined)
    return { title: 'New item', subject: sourceId === undefined ? 'the item types' : 'the item' };
  if (sources.item === null) return { title: 'Edit item', subject: 'the item' };
  return { title: `Edit ${sources.item.name}`, subject: sources.item.name };
}
