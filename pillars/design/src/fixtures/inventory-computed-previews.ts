import type { PreviewItem, PreviewState } from '@/kit/inventory/computed-editor/scenario';

function item(id: string, label: string, typeLabel = 'Electronics'): PreviewItem {
  return { id, label, typeLabel };
}

const charger = item('item-charger', 'MacBook charger');
const cable = item('item-cable', 'USB-C cable');
const adapter = item('item-adapter', 'Travel adapter');
const anker = item('item-anker', 'Anker PowerPort III');
const lamp = item('item-lamp', 'Desk lamp');
const samples = item('item-samples', 'Sample cable pack');
const spare = item('item-spare', 'Spare charger');
const dongle = item('item-dongle', 'HDMI dongle');
const travelKit = item('item-travel-kit', 'Travel kit', 'Bundle');
const deskKit = item('item-desk-kit', 'Desk kit', 'Bundle');
const blueCase = item('item-blue-case', 'Blue case', 'Case');
/** The one Storage box item the dimensional-units scenarios preview against. */
export const movingCrate: PreviewItem = item('item-moving-crate', 'Moving crate', 'Storage box');

/** Electronics items offered by the preview picker, a scrolling list in the product. */
export const electronicsPickerItems: readonly PreviewItem[] = [
  anker,
  charger,
  lamp,
  dongle,
  samples,
  spare,
  adapter,
  cable,
];

/** Replacement value on an item with no bundle: the second input answers. */
export const chargerReplacement: PreviewState = {
  state: 'value',
  item: charger,
  value: '48.00',
  workings: 'Input 1 skipped: Part of is empty. Input 2: 12.00 × 4.',
  traversed: [charger],
  dependencies: [
    { itemLabel: charger.label, fieldLabel: 'Unit price', revision: 7 },
    { itemLabel: charger.label, fieldLabel: 'Package count', revision: 7 },
  ],
};

/** Replacement value on an item whose override hides the calculated result. */
export const adapterOverridden: PreviewState = {
  state: 'value',
  item: adapter,
  value: '30.00',
  workings: 'Input 1: Replacement quote on Travel kit.',
  override: '35.00',
  traversed: [adapter, travelKit],
  dependencies: [
    { itemLabel: adapter.label, fieldLabel: 'Part of', revision: 3 },
    { itemLabel: travelKit.label, fieldLabel: 'Replacement quote', revision: 5 },
  ],
};

/** Replacement value when neither input has a value. */
export const cableUnavailable: PreviewState = {
  state: 'unavailable',
  item: cable,
  missingInputs: [
    { reason: 'missing_dependency', fieldLabel: 'Package count', itemLabel: cable.label },
  ],
  traversed: [cable],
  dependencies: [{ itemLabel: cable.label, fieldLabel: 'Unit price', revision: 2 }],
};

/** Shelf label two references away, with what it read disclosed. */
export const adapterShelf: PreviewState = {
  state: 'value',
  item: adapter,
  value: '“Shelf B2”',
  workings: 'Shelf on Blue case, reached through Travel kit.',
  traversed: [adapter, travelKit, blueCase],
  detailsOpen: true,
  dependencies: [
    { itemLabel: adapter.label, fieldLabel: 'Part of', revision: 3 },
    { itemLabel: travelKit.label, fieldLabel: 'Stored in', revision: 5 },
    { itemLabel: blueCase.label, fieldLabel: 'Shelf', revision: 2 },
  ],
};

/** Shelf label stopped one reference in: the bundle is not stored anywhere. */
export const spareShelfUnavailable: PreviewState = {
  state: 'unavailable',
  item: spare,
  missingInputs: [
    { reason: 'missing_dependency', fieldLabel: 'Stored in', itemLabel: deskKit.label },
  ],
  traversed: [spare, deskKit],
  dependencies: [{ itemLabel: spare.label, fieldLabel: 'Part of', revision: 4 }],
};

/** Shelf label on an item whose bundle was deleted. */
export const dongleShelfDeleted: PreviewState = {
  state: 'unavailable',
  item: dongle,
  missingInputs: [{ reason: 'reference_deleted', fieldLabel: 'Part of', itemLabel: dongle.label }],
  traversed: [dongle],
  dependencies: [{ itemLabel: dongle.label, fieldLabel: 'Part of', revision: 6 }],
};

/**
 * Replacement value falling all the way through a three-way coalesce: every
 * input is missing, on three different items and for three different
 * reasons, so the preview names all of them at once.
 */
export const samplesAllInputsMissing: PreviewState = {
  state: 'unavailable',
  item: samples,
  missingInputs: [
    { reason: 'missing_dependency', fieldLabel: 'Replacement quote', itemLabel: travelKit.label },
    { reason: 'reference_deleted', fieldLabel: 'Part of', itemLabel: samples.label },
    { reason: 'missing_dependency', fieldLabel: 'Unit price', itemLabel: samples.label },
  ],
  traversed: [samples, travelKit],
  dependencies: [{ itemLabel: samples.label, fieldLabel: 'Part of', revision: 1 }],
};

/** Volume on a crate sized 40 × 30 × 20 cm, shown converted into the field's own unit, litres. */
export const movingCrateVolume: PreviewState = {
  state: 'value',
  item: movingCrate,
  value: '24.0000 L',
  workings: 'Width 40 cm × Height 30 cm × Depth 20 cm = 24,000 cm³, converted to litres.',
  traversed: [movingCrate],
  dependencies: [
    { itemLabel: movingCrate.label, fieldLabel: 'Width', revision: 2 },
    { itemLabel: movingCrate.label, fieldLabel: 'Height', revision: 2 },
    { itemLabel: movingCrate.label, fieldLabel: 'Depth', revision: 2 },
  ],
};

/** Per-unit saving overflowing the decimal's stored precision. */
export const chargerPrecisionOverflow: PreviewState = {
  state: 'evaluation-error',
  item: charger,
  code: 'precision_overflow',
  traversed: [charger],
  dependencies: [{ itemLabel: charger.label, fieldLabel: 'Unit price', revision: 7 }],
};

/** Display name joined from two text fields and a space. */
export const ankerDisplayName: PreviewState = {
  state: 'value',
  item: anker,
  value: '“Anker PowerPort III”',
  workings: 'Anker, a space, then PowerPort III.',
  traversed: [anker],
  dependencies: [
    { itemLabel: anker.label, fieldLabel: 'Manufacturer', revision: 1 },
    { itemLabel: anker.label, fieldLabel: 'Model', revision: 1 },
  ],
};

/** Insured value taking the otherwise branch. */
export const chargerInsured: PreviewState = {
  ...chargerReplacement,
  workings: 'Package count 4 is not less than 1, so otherwise: 12.00 × 4.',
};

/** Needs attention answered by the second half of the or. */
export const lampNeedsAttention: PreviewState = {
  state: 'value',
  item: lamp,
  value: 'Yes',
  workings: 'Condition is Good, so: Powered is Yes and Has warranty is No.',
  traversed: [lamp],
  dependencies: [
    { itemLabel: lamp.label, fieldLabel: 'Condition', revision: 9 },
    { itemLabel: lamp.label, fieldLabel: 'Powered', revision: 9 },
    { itemLabel: lamp.label, fieldLabel: 'Has warranty', revision: 9 },
  ],
};

/** Per-unit saving on a pack recorded with zero units. */
export const samplesDivideByZero: PreviewState = {
  state: 'evaluation-error',
  item: samples,
  code: 'division_by_zero',
  traversed: [samples, travelKit],
  dependencies: [
    { itemLabel: samples.label, fieldLabel: 'Unit price', revision: 1 },
    { itemLabel: samples.label, fieldLabel: 'Part of', revision: 1 },
    { itemLabel: travelKit.label, fieldLabel: 'Replacement quote', revision: 5 },
    { itemLabel: samples.label, fieldLabel: 'Package count', revision: 1 },
  ],
};

/** The preview request in flight. */
export const chargerLoading: PreviewState = { state: 'loading', item: charger };

/** The preview request failed before it evaluated anything. */
export const chargerRequestError: PreviewState = { state: 'request-error', item: charger };
