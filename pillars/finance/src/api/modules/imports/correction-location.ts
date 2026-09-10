/**
 * Whose location wins when a correction rule matches a row that already has one.
 *
 * The row's own. A rule is matched on the DESCRIPTION, and a descriptor names
 * its own suburb: `PRICELINE PHARMACY BOWR BOWRAL` and
 * `PRICELINE PHARMACY CANT CANTERBURY` match the same pattern and are 120km
 * apart. The rule carried `Canterbury`, learned from the many, and stamped it
 * onto the one — leaving a row whose location contradicts its own descriptor,
 * and which reads as home when it should plausibly read as travel (POPS-3289).
 *
 * This is the discipline the rest of the module already keeps and location
 * alone did not: `providedEntityChange` never clears an existing entity, and
 * `mergedTags` is additive-only and never removes. A rule's location is a
 * DEFAULT for a row that states none — most parsers state none — not an
 * override of one the row states itself.
 *
 * One function rather than three copies of `??`, because it had drifted into
 * three places at once: both correction match builders and the retroactive
 * catch-up pass.
 */

/**
 * The location a matched row should end up with, or `undefined` for none.
 *
 * `undefined` rather than `null` because the wire shape it feeds
 * (`ParsedTransaction.location`) is optional — a row with no location omits
 * the field rather than carrying an empty one. The retroactive writer, whose
 * column is nullable, coalesces at its own boundary.
 *
 * @param rowLocation What the row already carries, from its own descriptor.
 * @param ruleLocation What the matched correction rule carries.
 */
export function resolveCorrectionLocation(
  rowLocation: string | null | undefined,
  ruleLocation: string | null | undefined
): string | undefined {
  // Blank counts as absent: a parser that wrote an empty string said nothing
  // about where the row was, and treating it as a stated location would let it
  // beat a rule that does know.
  const own = rowLocation?.trim();
  if (own !== undefined && own !== '') return rowLocation ?? undefined;
  const fromRule = ruleLocation?.trim();
  return fromRule !== undefined && fromRule !== '' ? (ruleLocation ?? undefined) : undefined;
}
