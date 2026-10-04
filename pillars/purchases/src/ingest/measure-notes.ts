/**
 * Recognising the merchant prose that means a line was priced by measure.
 *
 * `0.202 kg NET @ $2.90/kg`. Two adapters store one of these verbatim on
 * `purchase_item_notes` — the Woolworths grouper, which reads it off the
 * receipt row that carries the money, and receipt ingest, which keeps the
 * model's `unitNote` — and neither parses it, deliberately: inventing a
 * structured weight from prose is a guess about arithmetic the merchant
 * already did.
 *
 * Recognising it is a weaker claim than parsing it, and it is the one an
 * aggregate needs. A measured line has `quantity` 1 and a `unitPriceCents`
 * equal to what the weighed amount cost, so its "unit price" is a function
 * of how much was put on the scale. Comparing two of them across orders
 * reports a change in weight as a change in price — 0.5 kg of bananas
 * against 1.2 kg looks like a 140% rise — and nothing else on the row says
 * otherwise.
 *
 * One definition, in one place, because the grouper's decision ("this row
 * continues the product above it") and an aggregate's ("this note prices by
 * measure") are the same recognition, and two copies of it would answer
 * differently the first time either is widened.
 */

/**
 * `0.202 kg NET @ $2.90/kg` — a magnitude, a unit, and a rate.
 *
 * Anchored at the start because a measure row leads with its magnitude, and
 * it requires the `@` because that is what separates a priced measure from
 * prose that merely mentions a weight (`Sand Washed 20kg` is a product
 * name). `ea` is here because a till prices loose produce by the each.
 */
const UNIT_PRICE_NOTE_PATTERN = /^[\d.,]+\s*(kg|g|ml|l|ea)\b.*@/iu;

function unitForPriceNote(note: string): string | null {
  const unit = UNIT_PRICE_NOTE_PATTERN.exec(note)?.[1];
  return unit?.toLowerCase() ?? null;
}

/**
 * Whether receipt prose has the standalone magnitude/unit/rate shape of a
 * row that modifies the preceding product, including a per-each rate.
 */
export function isUnitPriceRow(note: string): boolean {
  return unitForPriceNote(note) !== null;
}

/**
 * Whether a note prices its line by weight or volume rather than by count.
 *
 * This is best-effort recognition at ingest. A per-each rate remains a
 * receipt continuation note but does not make the line's unit price depend
 * on the weighed amount.
 */
export function isMeasureNote(note: string): boolean {
  const unit = unitForPriceNote(note);
  return unit !== null && unit !== 'ea';
}
