/**
 * The purchase shape search reads from the Purchases pillar, and how the
 * Purchases scope matches a query: merchant, order number or any line.
 * Search only ever shows a purchase read-only (owner decision 4).
 */

/** One line of a purchase. */
export interface PurchaseLine {
  name: string;
  quantity: number;
  priceCents: number;
  /** The inventory item this line became, when one was recorded. */
  itemId?: string;
}

/** One purchase as search lists and previews it. */
export interface PurchaseResult {
  id: string;
  merchant: string;
  orderNumber: string;
  date: string;
  totalCents: number;
  lines: readonly PurchaseLine[];
}

/** Purchases whose merchant, order number or a line matches the query. */
export function searchPurchases(
  purchases: readonly PurchaseResult[],
  query: string
): PurchaseResult[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  return purchases.filter(
    (purchase) =>
      purchase.merchant.toLowerCase().includes(q) ||
      purchase.orderNumber.toLowerCase().includes(q) ||
      purchase.lines.some((line) => line.name.toLowerCase().includes(q))
  );
}
