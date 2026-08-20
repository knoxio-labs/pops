/**
 * The vocabulary of the two digital files in the Amazon DSAR bundle.
 *
 * Separate from `../amazon/columns.ts` because these are different files
 * with a different grain: the order-history export is one row per
 * shipment-item, and these are one row per *monetary component* of an
 * order item. Sharing a column list between them would let a missing
 * column in one file be satisfied by the other's shape check.
 *
 * The anomaly type IS shared, because both halves of the bundle feed the
 * same `summariseAnomalies` report and a reader should not have to learn
 * two shapes to read one backfill's output.
 */

export const DIGITAL_ORDERS_FILENAME = 'Digital Content Orders.csv';
export const DIGITAL_RETURNS_FILENAME = 'Digital Returns.csv';

/**
 * Where the two files sit relative to the bundle root. Both live under
 * `Your Amazon Orders/` alongside `Order History.csv` — the returns file
 * does NOT live with the physical returns under `Your Returns & Refunds/`.
 */
export const DIGITAL_ORDERS_BUNDLE_PATH = ['Your Amazon Orders', DIGITAL_ORDERS_FILENAME];
export const DIGITAL_RETURNS_BUNDLE_PATH = ['Your Amazon Orders', DIGITAL_RETURNS_FILENAME];

/**
 * Columns the order parser reads, out of the 75 the file carries.
 *
 * `Transaction Amount` is the one that matters and the one whose name gives
 * no hint of it: it is the money for THIS component row, and summing it
 * across an order's rows is the only figure in the file that says what was
 * actually charged. `Price` states the list price, which for a
 * credit-redeemed audiobook is money that never moved.
 */
export const DIGITAL_REQUIRED_COLUMNS = [
  'ASIN',
  'Base Currency Code',
  'Component Type',
  'Digital Order Item ID',
  'Marketplace',
  'Order Date',
  'Order ID',
  'Order Status',
  'Product Name',
  'Quantity Ordered',
  'Transaction Amount',
] as const;

/** Columns the returns parser reads. */
export const DIGITAL_RETURNS_REQUIRED_COLUMNS = [
  'Amount Refunded',
  'Base Currency',
  'Digital Order Item ID',
  'Monetary Component Type',
  'Order ID',
  'Return Date',
  'Return Status',
  'Transaction Amount',
] as const;

/**
 * The two component types both digital files state. `Price Amount` is the
 * goods, `Tax` is the tax, and a group's rows are one of each per
 * redemption.
 *
 * A third value has never been seen, so a row carrying one is reported
 * rather than folded into either: guessing which side of the subtotal/tax
 * split an unknown component belongs on would misstate both.
 */
export const PRICE_COMPONENT = 'Price Amount';
export const TAX_COMPONENT = 'Tax';

/** `Order Status` on every row that describes a completed purchase. */
export const SUCCESSFUL_ORDER_STATUS = 'success';

/**
 * `Return Status` meaning the return itself is finished.
 *
 * Gated for the reason the physical adapter gates on `Reversal Status`: the
 * errors are asymmetric. Ingesting a cancelled line loses nothing, whereas
 * recording an unfinished return would invent money coming back and
 * understate what an order cost.
 */
export const COMPLETED_RETURN_STATUS = 'customer return complete';
