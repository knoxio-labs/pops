/**
 * A CSV file someone kept before POPS: its own column names (Category,
 * Label, Bought), 48 rows, four of them wrong in the ways a real sheet is
 * wrong. Import maps the columns, then holds every row to bulk entry's
 * rules against the browse population.
 */
import { coreTypes } from './core';
import { householdPopulation } from './items-population';

import type { ColumnMapping } from '@/kit/inventory/import/import-model';

/** The file as picked. */
export const importFile = { name: 'garage-inventory-2025.csv', sizeKb: 6, rowCount: 48 } as const;

/** The file's header row. */
export const importHeaders: readonly string[] = [
  'Item',
  'Category',
  'Qty',
  'Label',
  'Location',
  'Bought',
  'Notes',
];

const places = ['Workbench', 'Shelving', 'Red toolbox', 'Garage', 'Moving box 04'];

function label(typeId: string | null): string {
  return coreTypes.find((type) => type.id === typeId)?.label ?? '';
}

const BROKEN: Readonly<Record<number, Partial<Record<number, string>>>> = {
  4: { 1: 'Cookware' },
  11: { 2: '0' },
  19: { 3: 'K12' },
  30: { 4: 'Loft' },
};

/** The file's rows, as text. */
export const importRows: readonly (readonly string[])[] = householdPopulation(48, 7)
  .filter((entry) => entry.container === null)
  .slice(0, 48)
  .map((entry, index) => {
    const cells = [
      entry.name,
      label(entry.typeId),
      String(entry.quantity),
      entry.code === null ? '' : entry.code.replace('H', 'GR'),
      places[index % places.length] ?? 'Garage',
      `2025-0${String((index % 9) + 1)}-1${String(index % 10)}`,
      index % 7 === 0 ? 'from the old flat' : '',
    ];
    const broken = BROKEN[index] ?? {};
    return cells.map((cell, column) => broken[column] ?? cell);
  });

/** A small CSV preview proving that both a leaf and its parent resolve. */
export const importTreeRows: readonly (readonly string[])[] = [
  ['Guest fitted sheet', 'Sheet', '1', 'SHT-01', 'Bedroom', '', ''],
  ['Blue quilt cover', 'Bedding', '1', 'QCV-01', 'Bedroom', '', ''],
];

/** The mapping after the owner pointed Category at Type and Label at Code. */
export const importMapping: readonly ColumnMapping[] = [
  { header: 'Item', target: 'name' },
  { header: 'Category', target: 'type' },
  { header: 'Qty', target: 'quantity' },
  { header: 'Label', target: 'code' },
  { header: 'Location', target: 'where' },
  { header: 'Bought', target: 'skip' },
  { header: 'Notes', target: 'note' },
];
