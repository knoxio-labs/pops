/**
 * What the label page knows about the print cast beyond the QR, name and
 * code: each item's type and field values, and what each box holds, for
 * labels that show fields or contents. Types and values are fictional.
 */
import {
  books05,
  espressoMachine,
  garageTools,
  kitchen12,
  kitchen12WithContents,
  linen02,
  movingCrate3,
  office04,
  printFixtureId,
  television,
} from './inventory-print';
import { office04WithContents } from './inventory-print-office';

import type { LabelDetails, LabelFieldValue } from '@/kit/inventory/print/label-content';

import type { PrintSubject } from '@pops/inventory/labels';

function line(subject: PrintSubject): string {
  return subject.quantity > 1 ? `${subject.name} ×${subject.quantity}` : subject.name;
}

function movingBox(room: string, packed: string, fragile: boolean, contents: string[]) {
  const fields: LabelFieldValue[] = [
    { id: 'moving-box.room', label: 'Room', value: room },
    { id: 'moving-box.packed', label: 'Packed', value: packed },
    { id: 'moving-box.fragile', label: 'Fragile', value: fragile ? 'Yes' : '' },
  ];
  return { typeName: 'Moving box', fields, contents } satisfies LabelDetails;
}

function typed(typeName: string, typeKey: string, values: [label: string, value: string][]) {
  return {
    typeName,
    fields: values.map(([label, value]) => ({
      id: `${typeKey}.${label.toLowerCase().replaceAll(' ', '-')}`,
      label,
      value,
    })),
    contents: [],
  } satisfies LabelDetails;
}

/** Details by item id; ids 21, 22, 31 and 32 are the cups, jug, drill and router. */
export const printDetails: Readonly<Record<string, LabelDetails>> = {
  [kitchen12.id]: movingBox('Kitchen', '22 Sep', true, kitchen12WithContents.slice(1).map(line)),
  [linen02.id]: movingBox('Hall cupboard', '22 Sep', false, [
    'Bath towels ×6',
    'Queen sheets ×2',
    'Pillowcases ×4',
    'Doona cover',
  ]),
  [office04.id]: movingBox('Study', '23 Sep', false, office04WithContents.slice(1).map(line)),
  [garageTools.id]: movingBox('Garage', '23 Sep', false, [
    'Cordless drill',
    'Socket set',
    'Tape measure',
    'Spirit level',
    'Claw hammer',
    'Extension lead, 10 m',
    'Safety glasses ×2',
  ]),
  [books05.id]: movingBox('Study', '24 Sep', false, [
    'Cookbooks ×8',
    'Road atlas',
    'Photo albums ×3',
  ]),
  [movingCrate3.id]: movingBox('Living room', '24 Sep', true, [
    'Board games ×4',
    'Picture frames ×3',
    'Throw blanket',
  ]),
  [espressoMachine.id]: typed('Appliance', 'appliance', [
    ['Brand', 'Breville'],
    ['Model', 'BES870'],
    ['Serial', 'BES870-2291-AU'],
  ]),
  [television.id]: typed('Appliance', 'appliance', [
    ['Brand', 'Sony'],
    ['Model', 'KD-55X85L'],
    ['Serial', 'S01-4471902'],
  ]),
  [printFixtureId(31)]: typed('Power tool', 'power-tool', [
    ['Brand', 'Makita'],
    ['Voltage', '18 V'],
  ]),
  [printFixtureId(32)]: typed('Network gear', 'network', [
    ['Brand', 'TP-Link'],
    ['Model', 'Deco X50'],
  ]),
  [printFixtureId(21)]: typed('Kitchenware', 'kitchenware', [['Material', 'Porcelain']]),
  [printFixtureId(22)]: typed('Kitchenware', 'kitchenware', [['Material', 'Stainless steel']]),
};
