/**
 * The report-only facts about each item, keyed by item id.
 *
 * The insurance report serves the same objects the items list does, so its
 * rows are projected from {@link inventoryItems} rather than written out a
 * second time: a report that did not reconcile with the list would be a
 * contradiction the product cannot produce, and the reconciliation is one of
 * the things this screen is reviewed for.
 *
 * What lives here is only what the report adds and an item row does not
 * carry: whether the item has a photo, which receipts are filed against it,
 * and how far its warranty sits from `now`. The warranty is an offset rather
 * than a date because `warrantyStatus` buckets relative to the current
 * instant, and a fixed date drifts into the wrong bucket as time passes.
 *
 * Between them these cover every branch `GroupTable` and `warrantyStatus`
 * distinguish: a location with one item and one with several, an item with
 * no replacement value beside one that has it (a partial subtotal), a group
 * where every item lacks a value (no subtotal row), items with and without a
 * photo or a receipt, and a warranty that is absent, expired, counting down,
 * and far enough out to print as a date.
 */
export interface ReportExtras {
  photoPath: string | null;
  receiptDocumentIds: number[];
  /** Days from `now` to the warranty's expiry, or null when there is none. */
  warrantyOffsetDays: number | null;
}

export const REPORT_EXTRAS: Record<string, ReportExtras> = {
  'itm-tv': { photoPath: 'tv/front.jpg', receiptDocumentIds: [4101], warrantyOffsetDays: 885 },
  'itm-laptop': {
    photoPath: 'laptop/lid.jpg',
    receiptDocumentIds: [4102, 4103],
    warrantyOffsetDays: 20,
  },
  'itm-espresso': {
    photoPath: 'espresso/front.jpg',
    receiptDocumentIds: [],
    warrantyOffsetDays: 8,
  },
  'itm-vacuum': { photoPath: null, receiptDocumentIds: [4104], warrantyOffsetDays: 122 },
  'itm-printer': { photoPath: null, receiptDocumentIds: [], warrantyOffsetDays: -1135 },
  'itm-camera': {
    photoPath: 'camera/body.jpg',
    receiptDocumentIds: [4105],
    warrantyOffsetDays: 22,
  },
  'itm-heater': { photoPath: null, receiptDocumentIds: [], warrantyOffsetDays: 18 },
  'itm-drill': { photoPath: 'drill/case.jpg', receiptDocumentIds: [4106], warrantyOffsetDays: 269 },
  'itm-bike': { photoPath: 'bike/side.jpg', receiptDocumentIds: [], warrantyOffsetDays: null },
  'itm-sofa': { photoPath: null, receiptDocumentIds: [], warrantyOffsetDays: null },
  'itm-kettle': { photoPath: null, receiptDocumentIds: [], warrantyOffsetDays: null },
  'itm-guitar': {
    photoPath: 'guitar/body.jpg',
    receiptDocumentIds: [4107],
    warrantyOffsetDays: 341,
  },
  'itm-mower': { photoPath: null, receiptDocumentIds: [], warrantyOffsetDays: null },
  'itm-books': { photoPath: null, receiptDocumentIds: [], warrantyOffsetDays: null },
};
