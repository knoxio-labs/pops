import type { ItemsUrlFilters } from '../../inventory-web/items-url-filters.js';
import type { CatalogueType } from '../../inventory-web/useCatalogueLookups.js';
import type { ItemRowModel, LocationModel } from '../model/model.js';

/** One value shown by a list filter select. */
export interface FilterOption {
  value: string;
  label: string;
}

/** One removable non-text filter shown below a list toolbar. */
export interface SummaryChip {
  id: 'untyped' | 'type' | 'within' | 'inactive';
  label: string;
  onRemove: () => void;
}

/** Counts type, placement, and inactive filters, excluding text, sort, and view. */
export function activeFilterCount(filters: ItemsUrlFilters): number {
  return [
    filters.typeKey !== null || filters.untyped,
    filters.within !== null,
    filters.inactive,
  ].filter(Boolean).length;
}

/** Reports whether the URL state narrows the server list in any way. */
export function isNarrowed(filters: ItemsUrlFilters): boolean {
  return filters.q.trim() !== '' || activeFilterCount(filters) > 0;
}

/** Builds sorted options for the non-archived published catalogue types. */
export function typeFilterOptions(types: readonly CatalogueType[]): FilterOption[] {
  return types
    .filter((type) => type.archivedAt === null)
    .toSorted((left, right) => left.sortOrder - right.sortOrder)
    .map((type) => ({ value: type.key, label: type.label }));
}

function locationOptions(locations: readonly LocationModel[]): FilterOption[] {
  const byParent = new Map<string | null, LocationModel[]>();
  for (const location of locations) {
    const siblings = byParent.get(location.parentId) ?? [];
    siblings.push(location);
    byParent.set(location.parentId, siblings);
  }

  const options: FilterOption[] = [];
  const visit = (location: LocationModel, ancestors: readonly LocationModel[]): void => {
    const path = [...ancestors, location];
    const label =
      path.length === 1
        ? location.name
        : path
            .slice(1)
            .map((node) => node.name)
            .join(' › ');
    options.push({ value: location.id, label });
    for (const child of byParent.get(location.id) ?? []) visit(child, path);
  };

  for (const root of byParent.get(null) ?? []) visit(root, []);
  return options;
}

/** Builds depth-first place options followed by active container options. */
export function placeFilterOptions(
  locations: readonly LocationModel[],
  containers: readonly ItemRowModel[]
): FilterOption[] {
  return [
    ...locationOptions(locations),
    ...containers
      .filter((item) => item.lifecycle === 'active')
      .map((item) => ({ value: item.id, label: `${item.name} (container)` })),
  ];
}

function placeLabel(value: string, places: readonly FilterOption[], fallback: string): string {
  return places.find((place) => place.value === value)?.label ?? fallback;
}

/** Names each active filter and returns callbacks that remove only that filter. */
export function filterChips(
  filters: ItemsUrlFilters,
  types: readonly FilterOption[],
  places: readonly FilterOption[],
  set: (patch: Partial<ItemsUrlFilters>) => void
): SummaryChip[] {
  const chips: SummaryChip[] = [];
  if (filters.untyped) {
    chips.push({ id: 'untyped', label: 'No type', onRemove: () => set({ untyped: false }) });
  } else if (filters.typeKey !== null) {
    const label = types.find((type) => type.value === filters.typeKey)?.label ?? filters.typeKey;
    chips.push({
      id: 'type',
      label: `Type: ${label}`,
      onRemove: () => set({ typeKey: null }),
    });
  }
  if (filters.within !== null) {
    chips.push({
      id: 'within',
      label: `In ${placeLabel(filters.within, places, filters.within)}`,
      onRemove: () => set({ within: null }),
    });
  }
  if (filters.inactive) {
    chips.push({
      id: 'inactive',
      label: 'Including inactive',
      onRemove: () => set({ inactive: false }),
    });
  }
  return chips;
}
