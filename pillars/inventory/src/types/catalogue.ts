/**
 * The initial inventory type catalogue: the six templates the approved
 * iOS design (`DesignPlayground/Surfaces/Inventory/Properties`) drew its
 * fixtures against. Field names, kinds, units and which fields are
 * highlighted match those templates exactly; each type's own declaration
 * lives in `./templates/` (one file per type, kept small).
 *
 * Where a `choice` field's template left its value list open (the
 * playground never closes "End A", "Plug", "Protocol" or "Use" to a fixed
 * set, unlike "Fitting" and "Material"), each template closes it: ADR-002
 * requires a `choice` field to declare its choices, and the fixtures'
 * actual values (`USB-C`, `Type I`, `Zigbee`, `Gaffer`) are included in the
 * chosen list. Narrowing that list later is a type change, guarded by
 * `type-migrations.ts`.
 */
import { bulbType } from './templates/bulb.js';
import { cableType } from './templates/cable.js';
import { chargerType } from './templates/charger.js';
import { furnitureType } from './templates/furniture.js';
import { storageBoxType } from './templates/storage-box.js';
import { tapeType } from './templates/tape.js';

import type { TypeDefinition } from './define-type.js';

export { bulbType, cableType, chargerType, furnitureType, storageBoxType, tapeType };

/** Every type A1 ships, in the order the playground introduces them. */
export const INVENTORY_TYPES: readonly TypeDefinition[] = [
  cableType,
  chargerType,
  bulbType,
  tapeType,
  storageBoxType,
  furnitureType,
];

/** The type declared under `key`, or `undefined` if the catalogue has none by that key. */
export function findType(key: string): TypeDefinition | undefined {
  return INVENTORY_TYPES.find((type) => type.key === key);
}
