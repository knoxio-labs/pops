/**
 * The items the label page prints, drawn from the shared Inventory cast the
 * iOS playground uses (Kitchen 12 is B412 in the kitchen, the television is
 * K7Q2, the cordless drill is T031), so a label here matches the item a phone
 * opens when it scans one. Ids are UUIDv4 because ADR-002 has clients mint
 * them, and the QR's density depends on the id's length.
 */
import type { PrintSubject } from '@pops/inventory/labels';
import type { SheetGeometry } from '@pops/inventory/labels';

/** A stable, UUIDv4-shaped id for fixture `n`. */
export function printFixtureId(n: number): string {
  return `8c1e4f2a-5b7d-4a9e-b3c6-${n.toString(16).padStart(12, '0')}`;
}

function box(n: number, name: string, code: string | null, place: string): PrintSubject {
  return {
    id: printFixtureId(n),
    name,
    code,
    suggestedCode: null,
    kind: 'container',
    place,
    quantity: 1,
  };
}

function packed(n: number, name: string, code: string | null, place: string): PrintSubject {
  return {
    id: printFixtureId(n),
    name,
    code,
    suggestedCode: null,
    kind: 'item',
    place,
    quantity: 1,
  };
}

export const kitchen12 = box(1, 'Kitchen 12', 'B412', 'Kitchen');
export const linen02 = box(2, 'Linen 02', 'B207', 'Hall cupboard');
export const office04 = box(3, 'Office 04', 'B404', 'Study');
export const garageTools = box(4, 'Garage tools', 'B318', 'Garage');
export const books05 = box(5, 'Books 05', 'B509', 'Study');
export const movingCrate3 = box(6, 'Moving crate 3', 'B601', 'Living room');

/** The boxes packed this week, labelled before they are closed. */
export const printBoxes: PrintSubject[] = [
  kitchen12,
  linen02,
  office04,
  garageTools,
  books05,
  movingCrate3,
];

export const espressoMachine = packed(
  20,
  'Espresso machine with the steam wand that needs descaling every three weeks',
  'BREW-2026-0007-A',
  'Kitchen 12'
);

/** Kitchen 12 and what is in it, every item already coded. */
export const kitchen12WithContents: PrintSubject[] = [
  kitchen12,
  espressoMachine,
  { ...packed(21, 'Coffee cups', 'KIT-031', 'Kitchen 12'), quantity: 6 },
  packed(22, 'Milk jug, stainless steel with a measuring scale inside', 'KIT-032', 'Kitchen 12'),
];

/** The same box before its cups and jug were given codes. */
export const kitchen12Uncoded: PrintSubject[] = [
  kitchen12,
  espressoMachine,
  { ...packed(21, 'Coffee cups', null, 'Kitchen 12'), quantity: 6, suggestedCode: 'KIT-031' },
  {
    ...packed(22, 'Milk jug, stainless steel with a measuring scale inside', null, 'Kitchen 12'),
    suggestedCode: 'KIT-032',
  },
];

export const television = packed(30, 'Television', 'K7Q2', 'Living room');

/** A handful chosen from the items list. */
export const printHandful: PrintSubject[] = [
  television,
  packed(31, 'Cordless drill', 'T031', 'Garage tools'),
  packed(32, 'Wi-Fi router', 'N004', 'Office 04'),
  espressoMachine,
];

/** The item already holding the code a person typed for another. */
export const codeHolder = { code: 'KIT-030', name: 'Coffee grinder', suggestion: 'KIT-031' };

/** Names and places at the limit of what a label can hold. */
export const printLongNames: PrintSubject[] = [
  box(40, 'Kitchen 14, glasses and the good plates from the top cupboard', 'B414', 'Kitchen'),
  box(41, 'Linen 03', 'B208', 'Hall cupboard, top shelf behind the vacuum cleaner'),
  espressoMachine,
  packed(42, 'Milk jug, stainless steel with a measuring scale inside', 'KIT-032', 'Kitchen 12'),
];

/** A 27-up sheet no preset covers, measured by hand: both templates fit. */
export const customSheet27: SheetGeometry = {
  columns: 3,
  rows: 9,
  labelWidthMm: 63.5,
  labelHeightMm: 29.6,
  marginTopMm: 15.3,
  marginLeftMm: 7.21,
  pitchXMm: 66.04,
  pitchYMm: 29.6,
};

/** Labels wide enough for the item label's QR and code, too narrow for a box's name. */
export const customSheetNarrow: SheetGeometry = {
  columns: 5,
  rows: 9,
  labelWidthMm: 38,
  labelHeightMm: 30,
  marginTopMm: 13.5,
  marginLeftMm: 6,
  pitchXMm: 40,
  pitchYMm: 30,
};

/** A 65-up address sheet: no QR that scans fits on a 21.2 mm label. */
export const customSheetTooSmall: SheetGeometry = {
  columns: 5,
  rows: 13,
  labelWidthMm: 38.1,
  labelHeightMm: 21.2,
  marginTopMm: 10.7,
  marginLeftMm: 4.75,
  pitchXMm: 40.64,
  pitchYMm: 21.2,
};
