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
const MEASURE_NOTE_PATTERN = /^[\d.,]+\s*(kg|g|ml|l|ea)\b.*@/iu;

/**
 * Whether a note prices its line by measure rather than by count.
 *
 * Best-effort, and wrong in both directions: a wording this pattern has not
 * met is read as a count, and `1 ea @ $5.00` — a genuine per-each price — is
 * read as a measure. Neither moves a figure. Nothing derives a price from
 * this answer; it only says whether the unit prices in a series are
 * comparable, so a miss leaves a caveat unstated and a false positive states
 * one that was not needed.
 */
export function isMeasureNote(note: string): boolean {
  return MEASURE_NOTE_PATTERN.test(note);
}
