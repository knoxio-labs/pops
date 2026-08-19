/**
 * Reading a line's product identity back off its two stored columns.
 *
 * `purchase_items` stores the identifier and its namespace flat, because a
 * column pair is what a relational table can index; every consumer reads
 * them as one value, because an identifier without its namespace cannot be
 * compared to anything. This is the single place that conversion happens, so
 * a caller cannot acquire one half.
 *
 * The database holds one direction of the pair — a namespace with nothing in
 * it is a CHECK violation — and the write path holds the other, by carrying
 * both halves as one value from the request body to the insert. That leaves
 * exactly one way an identifier with no namespace could reach a reader: a
 * hand-written UPDATE against the file. This function refuses it rather than
 * handing back a bare string, because a bare string is precisely what
 * downstream grouping would join two unrelated products on.
 *
 * Distinct from `product-identity.ts`, which decides which *lines* are one
 * product. This states what one line's merchant called it; that groups lines
 * on the strongest evidence each of them carries.
 */
import type { SkuScheme } from '../../contract/constants.js';
import type { ProductIdentity } from '../../contract/types/purchase.js';

/** The columns this reading needs, so any row shape carrying them qualifies. */
export interface StoredProductIdentity {
  readonly id: string;
  readonly sku: string | null;
  readonly skuScheme: SkuScheme | null;
}

/** Null when the source stated no identifier — every shipped adapter but the Amazon exports. */
export function productIdentityOf(row: StoredProductIdentity): ProductIdentity | null {
  if (row.sku === null) return null;
  if (row.skuScheme === null) {
    throw new Error(
      `purchase item ${row.id} carries the sku "${row.sku}" with no scheme, so nothing can say what it identifies`
    );
  }
  return { value: row.sku, scheme: row.skuScheme };
}
