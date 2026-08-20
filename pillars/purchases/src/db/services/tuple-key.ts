/**
 * A composite key that its own parts cannot forge.
 *
 * Every grouping key in this pillar is a tuple of free text — a merchant
 * name, a product name, a sku a merchant chose — and joining those on a
 * delimiter is not injective: `["a~b", "c"]` and `["a", "b", "c"]` collapse
 * to the same string the moment a source prints the separator, and two
 * different things then share a bucket. That is the failure every fold here
 * is written to avoid, so the encoding is JSON, which is injective over
 * strings whatever they contain. The Woolworths checksum is built on the
 * same reasoning.
 */
export function tupleKey(...parts: readonly (string | null)[]): string {
  return JSON.stringify(parts);
}
