import type { CatalogueReferenceTargets } from '@/fixtures/inventory-type-fields';

/** Which target kinds a reference field accepts, or none when nothing is chosen. */
export type ReferenceScope = 'items' | 'locations' | 'items-and-locations' | 'none';

/** Classifies a reference field's `referenceKinds` into the configuration it represents. */
export function referenceScope(targets: CatalogueReferenceTargets): ReferenceScope {
  const items = targets.kinds.includes('item');
  const locations = targets.kinds.includes('location');
  if (items && locations) return 'items-and-locations';
  if (items) return 'items';
  if (locations) return 'locations';
  return 'none';
}

function itemPhrase(typeLabels: readonly string[]): string {
  if (typeLabels.length === 0) return 'any item';
  const formatter = new Intl.ListFormat('en', { style: 'long', type: 'disjunction' });
  return `${formatter.format(typeLabels)} items`;
}

/**
 * One sentence naming what the field accepts, as the API enforces it: an
 * empty type list allows every item type, and types never limit locations.
 */
export function referenceTargetSummary(
  targets: CatalogueReferenceTargets,
  typeLabel: (typeId: string) => string
): string {
  const items = itemPhrase(targets.typeIds.map(typeLabel));
  switch (referenceScope(targets)) {
    case 'items':
      return `Accepts ${items}.`;
    case 'locations':
      return 'Accepts any location.';
    case 'items-and-locations':
      return `Accepts ${items} or any location.`;
    case 'none':
      return 'Choose at least one target kind.';
  }
}

/** Item types only constrain item targets, so the picker exists only while items are allowed. */
export function showsItemTypes(targets: CatalogueReferenceTargets): boolean {
  return targets.kinds.includes('item');
}
