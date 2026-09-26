/**
 * Bulk entry scenarios: a few rows typed by hand, a spreadsheet paste with
 * a header, and the same paste with problems a partial accept leaves
 * behind. Validation runs against the browse population, so a code or a
 * place a row names is refused or resolved by the real rules.
 */
import { parsePaste } from '@/kit/inventory/bulk-entry/paste-parser';

import { inventoryCatalogueTypes } from '../inventory-type-catalogue';
import { coreLocations, coreTypes } from './core';
import { browseInventory } from './items-browse';

import type { BulkDraft } from '@/kit/inventory/bulk-entry/paste-parser';
import type { BulkContext } from '@/kit/inventory/bulk-entry/row-validation';

const placeNames = new Set(
  [
    ...coreLocations.map((node) => node.name),
    ...browseInventory.filter((entry) => entry.container !== null).map((entry) => entry.name),
  ].map((name) => name.toLowerCase())
);

/** What bulk entry validates against. */
export const bulkContext: BulkContext = {
  types: [
    ...coreTypes.map((type) => ({
      id: type.id,
      label: type.label,
      containment: type.containment,
      parentTypeId: type.parentTypeId,
    })),
    ...inventoryCatalogueTypes.map((type) => ({
      id: type.id,
      label: type.label,
      containment: false,
      parentTypeId: type.parentTypeId,
      pathLabel: type.label,
    })),
  ],
  codes: new Map(
    browseInventory.flatMap((entry) =>
      entry.code === null ? [] : [[entry.code.toUpperCase(), entry.name] as const]
    )
  ),
  resolvesWhere: (text) => placeNames.has(text.trim().toLowerCase()),
};

/** Rows typed by hand, the first half-finished. */
export const typedRows: readonly BulkDraft[] = [
  { name: 'Wok', type: 'Kitchenware', quantity: '1', code: '', where: 'Moving box 03', note: '' },
  {
    name: 'Rice cooker',
    type: 'Kitchenware',
    quantity: '',
    code: 'RC1',
    where: 'Moving box 03',
    note: '',
  },
  { name: 'Measuring cups', type: '', quantity: '4', code: '', where: '', note: 'set of 4' },
];

/** A type-tree row set used by the review state for the Type cell. */
export const treeTypedRows: readonly BulkDraft[] = [
  {
    name: 'Guest fitted sheet',
    type: 'Sheet',
    quantity: '1',
    code: '',
    where: 'Bedroom',
    note: '',
  },
  {
    name: 'Blue quilt cover',
    type: 'Bedding',
    quantity: '1',
    code: '',
    where: 'Bedroom',
    note: '',
  },
];

/** A spreadsheet paste, as the clipboard carries it. */
export const pastedText = [
  'Item\tType\tQty\tCode\tLocation\tColour',
  'Stock pot\tKitchenware\t1\t\tMoving box 07\tsilver',
  'Frying pan\tKitchenware\t2\t\tMoving box 07\tblack',
  'Tea towels\tLinen\t6\t\tMoving box 07\t',
  'Baking trays\tKitchenware\t3\t\tMoving box 07\t',
  'Cake tin\tKitchenware\t1\t\tMoving box 07\t',
  'Toaster\tKitchenware\t1\tTS1\tMoving box 11\twhite',
  'Kettle\tKitchenware\t1\tK12\tMoving box 11\t',
  'Mixing bowls\tCookware\t3\t\tMoving box 11\t',
  'Spice rack\tKitchenware\t1\t\tMoving box 11\t',
  'Blender jug\tKitchenware\t1\t\tMoving box 11\t',
  'Salad spinner\tKitchenware\t1\t\tLaundry\t',
  'Oven mitts\tLinen\ttwo\t\tMoving box 11\t',
].join('\n');

/** The paste, parsed. */
export const pasted = parsePaste(pastedText);

/** The paste with every problem fixed: a clean submit. */
export const cleanRows: readonly BulkDraft[] = pasted.rows.map((row) => {
  if (row.code === 'K12') return { ...row, code: 'KT1' };
  if (row.type === 'Cookware') return { ...row, type: 'Kitchenware' };
  if (row.where === 'Laundry') return { ...row, where: 'Kitchen' };
  if (row.quantity === 'two') return { ...row, quantity: '2' };
  return row;
});
