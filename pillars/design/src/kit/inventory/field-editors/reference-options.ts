/**
 * What a reference field's picker offers: every active item and every
 * place, ranked for the query, with the allowed ones first and each refused
 * one carrying the reason in words.
 */
import { rankMatch } from '../command-palette/palette-groups';
import { referenceRefusal } from './field-rules';

import type { ItemRowModel, LocationModel } from '../shared/model';
import type { PlacementWorld } from '../shared/placement-model';
import type { ReferenceTargets } from './field-model';

/** One row of the reference picker. */
export type ReferenceOption =
  | { kind: 'item'; item: ItemRowModel; refusal: string | null }
  | { kind: 'location'; location: LocationModel; refusal: string | null };

/** The allowed targets as one phrase: "Furniture items or any place". */
export function targetsPhrase(
  targets: ReferenceTargets,
  typeLabel: (typeId: string) => string
): string {
  const items =
    targets.typeIds.length === 0
      ? 'any item'
      : `${targets.typeIds.map(typeLabel).join(' or ')} items`;
  const parts = [
    targets.kinds.includes('item') ? items : null,
    targets.kinds.includes('location') ? 'any place' : null,
  ].filter((part): part is string => part !== null);
  const phrase = parts.join(' or ');
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

function optionName(option: ReferenceOption): string {
  return option.kind === 'item' ? option.item.name : option.location.name;
}

/** What {@link referenceOptions} ranks against. */
export interface ReferenceQuery {
  world: PlacementWorld;
  targets: ReferenceTargets;
  query: string;
  typeLabel: (typeId: string) => string;
  limit?: number;
}

/** Picker rows for `query`, allowed first, at most `limit` (8). */
export function referenceOptions({
  world,
  targets,
  query,
  typeLabel,
  limit = 8,
}: ReferenceQuery): ReferenceOption[] {
  const items: ReferenceOption[] = [...world.items.values()]
    .filter((item) => item.lifecycle === 'active')
    .map((item) => ({
      kind: 'item',
      item,
      refusal: referenceRefusal(targets, { kind: 'item', typeId: item.typeId }, typeLabel),
    }));
  const places: ReferenceOption[] = [...world.locations.values()].map((location) => ({
    kind: 'location',
    location,
    refusal: referenceRefusal(targets, { kind: 'location', typeId: null }, typeLabel),
  }));
  return [...items, ...places]
    .map((option) => ({ option, rank: rankMatch(query, optionName(option)) }))
    .filter((scored) => scored.rank > 0)
    .toSorted(
      (a, b) =>
        Number(a.option.refusal !== null) - Number(b.option.refusal !== null) ||
        b.rank - a.rank ||
        optionName(a.option).localeCompare(optionName(b.option))
    )
    .slice(0, limit)
    .map((scored) => scored.option);
}
