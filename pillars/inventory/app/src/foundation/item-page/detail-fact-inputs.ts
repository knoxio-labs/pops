import type { DetailFact, LegacyItem, WebItem } from './detail-types';

type FactExtra = Partial<Pick<DetailFact, 'origin' | 'missingInputs' | 'mono'>>;

/** One legacy or projected field before it is formatted for the facts rail. */
export interface LegacyFactInput {
  key: string;
  value: unknown;
  extra?: FactExtra;
}

function statusValue(value: boolean | null | undefined): string | null {
  if (value === true) return 'In Use';
  if (value === false) return 'Stored';
  return null;
}

function legacyIdentityInputs(legacyItem: LegacyItem, webItem?: WebItem): LegacyFactInput[] {
  return [
    { key: 'type', value: legacyItem.type ?? webItem?.legacyType },
    { key: 'condition', value: legacyItem.condition },
    { key: 'brand', value: legacyItem.brand },
    { key: 'model', value: legacyItem.model },
    { key: 'room', value: legacyItem.room },
    { key: 'location', value: legacyItem.location },
    { key: 'assetId', value: legacyItem.assetId ?? webItem?.code, extra: { mono: true } },
    { key: 'inUse', value: statusValue(legacyItem.inUse) },
  ];
}

function legacyPurchaseInputs(legacyItem: LegacyItem, webItem?: WebItem): LegacyFactInput[] {
  return [
    { key: 'purchaseDate', value: legacyItem.purchaseDate ?? webItem?.provenance?.purchasedOn },
    { key: 'purchasePrice', value: legacyItem.purchasePrice ?? webItem?.provenance?.price },
    { key: 'replacementValue', value: legacyItem.replacementValue },
    { key: 'resaleValue', value: legacyItem.resaleValue },
    {
      key: 'warrantyExpires',
      value: legacyItem.warrantyExpires ?? webItem?.provenance?.warrantyExpires,
    },
    { key: 'deductible', value: legacyItem.deductible },
  ];
}

/** Collects legacy and projected fields in the facts-rail display order. */
export function legacyFactInputs(legacyItem: LegacyItem, webItem?: WebItem): LegacyFactInput[] {
  return [
    ...legacyIdentityInputs(legacyItem, webItem),
    ...legacyPurchaseInputs(legacyItem, webItem),
  ];
}
