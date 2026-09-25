/**
 * Codes for the item form: every code already in use (from the foundation's
 * named items, plus a run of Electronics codes so a suggestion has a stem to
 * continue), and what `POST /codes/suggest` answers for each type.
 */
import { coreInventory } from './core';

import type { TakenCodes } from '@/kit/inventory/item-form/code-assist';

const electronicsRun = Array.from({ length: 13 }, (_, index) => {
  const code = `E${String(index + 1).padStart(2, '0')}`;
  return [
    code.toLowerCase(),
    { id: `itm-e${index + 1}`, name: `Electronics item ${code}` },
  ] as const;
});

/** Every code in use, by lowercase code. */
export const takenCodes: TakenCodes = new Map([
  ...coreInventory.flatMap((entry) =>
    entry.code === null
      ? []
      : [[entry.code.toLowerCase(), { id: entry.id, name: entry.name }] as const]
  ),
  ...electronicsRun,
]);

/** What the suggester returns per type: the next free code on the type's stem. */
export const suggestedCodes: Readonly<Record<string, string>> = {
  'type-electronics': 'E14',
  'type-camera': 'C01',
  'type-box': 'K14',
  'type-tub': 'T03',
};

/** The suggestion for an untyped item, numbered on the house-wide stem. */
export const untypedSuggestion = 'H01';

/** A code someone types that the label printer already has. */
export const collidingCode = 'P01';
