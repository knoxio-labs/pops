/**
 * Drafts the item form opens on: a new pair of headphones part-typed, the
 * label printer (a real core item, code P01, on the desk) opened for
 * editing with every one-value kind filled, a camera kit with every
 * many-value kind filled, the computed field's four conditions, and the
 * photo queues a create and an edit can hold.
 */
import { EMPTY_DRAFTS } from '@/kit/inventory/field-editors/field-model';
import { codeEntry } from '@/kit/inventory/item-form/code-assist';
import { blankDraft } from '@/kit/inventory/item-form/form-draft';

import type { ComputedDisplay } from '@/kit/inventory/field-editors/computed-row';
import type { FieldDrafts } from '@/kit/inventory/field-editors/field-model';
import type { ItemDraft } from '@/kit/inventory/item-form/form-draft';
import type { PhotoUpload } from '@/kit/inventory/item-form/photo-queue';

const ELECTRONICS = 'type-electronics';

/** Headphones, named and typed, a few fields filled. */
export const headphonesDraft: ItemDraft = {
  ...blankDraft(undefined, ELECTRONICS),
  name: 'Noise-cancelling headphones',
  fields: {
    text: { manufacturer: ['Sony'], model: ['WH-1000XM6'], connectors: ['usb-c', 'audio'] },
    refs: {},
  },
};

const labelPrinterValues: FieldDrafts = {
  text: {
    manufacturer: ['Brother'],
    model: ['QL-820NWB'],
    condition: ['good'],
    connectors: ['usb-c', 'ethernet', 'mini-hdmi'],
    ports: ['2'],
    unit_price: ['89.00'],
    package_count: ['2'],
    powered: ['true'],
    weight: ['1.14'],
    purchased_on: ['2025-03-14'],
    registered_at: ['2025-03-15T09:30'],
    manual: ['https://example.com/manuals/ql-820nwb.pdf'],
    setup_notes: ['Takes 62 mm continuous rolls. The spare roll is in the desk drawer.'],
  },
  refs: {
    works_with: [{ kind: 'item', id: 'itm-monitor', name: 'Monitor 27 in' }],
    stored_with: [{ kind: 'location', id: 'loc-desk', name: 'Desk' }],
  },
};

/** The label printer, opened for editing. */
export const labelPrinterDraft: ItemDraft = {
  ...blankDraft({ kind: 'location', locationId: 'loc-desk' }, ELECTRONICS),
  mode: 'edit',
  name: 'Label printer',
  fields: labelPrinterValues,
  code: codeEntry('P01'),
};

function without(drafts: FieldDrafts, ...ids: string[]): FieldDrafts {
  const text = Object.fromEntries(Object.entries(drafts.text).filter(([id]) => !ids.includes(id)));
  return { text, refs: drafts.refs };
}

/** The label printer with Package count cleared. */
export const printerNoCount: ItemDraft = {
  ...labelPrinterDraft,
  fields: without(labelPrinterValues, 'package_count'),
};

/** The label printer with both of Replacement value's inputs cleared. */
export const printerNoInputs: ItemDraft = {
  ...labelPrinterDraft,
  fields: without(labelPrinterValues, 'package_count', 'unit_price'),
};

/** Replacement value, calculated. */
export const printerCalculated: ComputedDisplay = {
  state: 'calculated',
  value: '178.00',
  workings: 'Unit price 89.00 × Package count 2.',
};

/** Replacement value, missing one input. */
export const printerMissingInput: ComputedDisplay = {
  state: 'unavailable',
  missingInputs: [
    { reason: 'missing_dependency', fieldLabel: 'Package count', itemLabel: 'Label printer' },
  ],
};

/** Replacement value, missing both inputs. */
export const printerMissingInputs: ComputedDisplay = {
  state: 'unavailable',
  missingInputs: [
    { reason: 'missing_dependency', fieldLabel: 'Unit price', itemLabel: 'Label printer' },
    { reason: 'missing_dependency', fieldLabel: 'Package count', itemLabel: 'Label printer' },
  ],
};

/** A camera kit with every many-value kind holding values. */
export const cameraKitDraft: ItemDraft = {
  ...blankDraft({ kind: 'container', containerId: 'box-o04' }, 'type-camera'),
  mode: 'edit',
  name: 'Fujifilm X-T5 kit',
  code: codeEntry('C01'),
  fields: {
    text: {
      serials: ['5AB04471', '5CD10932'],
      mounts: ['x', 'm42'],
      battery_cycles: ['212', '187', '41'],
      apertures: ['1.4', '2.8'],
      filter_sizes: ['52', '58', '62'],
      weather_sealed: ['true'],
      serviced_on: ['2025-06-02', '2026-04-19'],
      firmware_updated: ['2026-01-11T20:15', '2026-08-30T08:40'],
      manuals: ['https://example.com/x-t5.pdf', 'https://example.com/xf23.pdf'],
      service_notes: [
        'Sensor cleaned; one hot pixel mapped out.',
        'Shutter count 18,240 at the last service.',
      ],
    },
    refs: {
      works_with: [
        { kind: 'item', id: 'itm-printer', name: 'Label printer' },
        { kind: 'item', id: 'itm-monitor', name: 'Monitor 27 in' },
      ],
    },
  },
};

/** A new camera kit with only its lens mounts chosen. */
export const cameraMountsDraft: ItemDraft = {
  ...blankDraft(undefined, 'type-camera'),
  name: 'Fujifilm X-T5 kit',
  fields: { text: { mounts: ['x', 'm42'] }, refs: {} },
};

/** A draft whose values break their kinds' rules, after Save was pressed. */
export const brokenDraft: ItemDraft = {
  ...blankDraft(undefined, ELECTRONICS),
  quantity: '0',
  submitted: true,
  fields: {
    text: { ports: ['four'], unit_price: ['89.1234567891'], manual: ['brother.com/ql-820nwb'] },
    refs: {},
  },
};

/** Nothing typed. */
export const emptyValues: FieldDrafts = EMPTY_DRAFTS;

const photo = (
  localId: string,
  fileName: string,
  bytes: number,
  status: PhotoUpload['status']
) => ({
  localId,
  fileName,
  bytes,
  status,
});

/** Three photos chosen while creating, waiting for the item to exist. */
export const stagedPhotos: readonly PhotoUpload[] = [
  photo('p1', 'headphones-front.jpg', 2_480_000, { kind: 'staged' }),
  photo('p2', 'headphones-in-case.jpg', 1_910_000, { kind: 'staged' }),
  photo('p3', 'serial-label.heic', 860_000, { kind: 'staged' }),
];

/** The same three, uploading against the new item once Create ran. */
export const uploadingPhotos: readonly PhotoUpload[] = [
  photo('p1', 'headphones-front.jpg', 2_480_000, { kind: 'attached' }),
  photo('p2', 'headphones-in-case.jpg', 1_910_000, { kind: 'uploading', percent: 62 }),
  photo('p3', 'serial-label.heic', 860_000, { kind: 'uploading', percent: 0 }),
];

/** An edit whose photo upload failed after the item was saved. */
export const failedPhotos: readonly PhotoUpload[] = [
  photo('p4', 'printer-back.jpg', 3_120_000, { kind: 'attached' }),
  photo('p5', 'printer-ports.jpg', 2_050_000, { kind: 'failed', reason: 'the connection dropped' }),
];
