export interface DetailHeaderItem {
  itemName: string;
  brand?: string | null;
  model?: string | null;
  type?: string | null;
  condition?: string | null;
  warrantyExpires?: string | null;
  room?: string | null;
  assetId?: string | null;
  inUse: boolean;
  purchaseDate?: string | null;
  replacementValue?: number | null;
  locationId?: string | null;
  purchaseTransactionId?: string | null;
  purchasedFromId?: string | null;
  purchasedFromName?: string | null;
  notes?: string | null;
}
