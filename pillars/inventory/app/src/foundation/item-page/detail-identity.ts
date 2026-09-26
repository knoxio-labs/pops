import type { Lifecycle } from '../model/model';
import type { ItemDetailAggregate, LegacyItem, WebItem } from './detail-types';

type IdentityFields = Pick<
  ItemDetailAggregate,
  | 'id'
  | 'name'
  | 'lifecycle'
  | 'lifecycleChangedAt'
  | 'quantity'
  | 'isContainer'
  | 'containerAccess'
  | 'containerFull'
  | 'code'
  | 'typeName'
  | 'note'
  | 'readOnly'
>;

function basicIdentityFields(
  legacyItem: LegacyItem,
  webItem: WebItem | undefined,
  lifecycle: Lifecycle
): Omit<IdentityFields, 'isContainer' | 'containerAccess' | 'containerFull' | 'readOnly'> {
  return {
    id: legacyItem.id,
    lifecycle,
    ...itemValueFields(legacyItem, webItem),
    ...labelFields(legacyItem, webItem),
  };
}

function itemValueFields(
  legacyItem: LegacyItem,
  webItem: WebItem | undefined
): Pick<IdentityFields, 'name' | 'lifecycleChangedAt' | 'quantity' | 'code'> {
  return {
    name: webItem?.name ?? legacyItem.itemName,
    lifecycleChangedAt: webItem?.lifecycleChangedAt ?? null,
    quantity: webItem?.quantity ?? 1,
    code: webItem?.code ?? legacyItem.assetId,
  };
}

function labelFields(
  legacyItem: LegacyItem,
  webItem: WebItem | undefined
): Pick<IdentityFields, 'typeName' | 'note'> {
  return {
    typeName: webItem?.typeKey ?? webItem?.legacyType ?? legacyItem.type,
    note: webItem?.note ?? legacyItem.notes,
  };
}

function containerFields(
  legacyItem: LegacyItem,
  webItem: WebItem | undefined
): Pick<IdentityFields, 'isContainer' | 'containerAccess' | 'containerFull'> {
  return {
    isContainer: webItem?.isContainer ?? legacyItem.containerId !== null,
    containerAccess: webItem?.access ?? null,
    containerFull: webItem?.isFull ?? null,
  };
}

/** Builds the identity and lifecycle fields shared by item-detail views. */
export function identityFields(
  legacyItem: LegacyItem,
  webItem: WebItem | undefined,
  lifecycle: Lifecycle
): IdentityFields {
  return {
    ...basicIdentityFields(legacyItem, webItem, lifecycle),
    ...containerFields(legacyItem, webItem),
    readOnly: lifecycle === 'destroyed',
  };
}
