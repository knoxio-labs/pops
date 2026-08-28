/**
 * What an importer was able to read about a foreign charge, recorded per row
 * (POPS-2647).
 *
 * `country` and the three foreign-charge columns say what capture *found*.
 * They cannot say whether it *ran*: on an ANZ row `country IS NULL AND
 * foreign_currency IS NULL` means either "billed in AUD" or "imported before
 * anything read the descriptor", and no query separates the two. Amex escapes
 * that only because its long export states a merchant country on every row,
 * which is a property of one export shape rather than a rule other banks
 * follow.
 *
 * Defaulting an ANZ row to `AU` would not fix it. The absence of a
 * foreign-currency trailer means the charge was *billed* in AUD, not that the
 * merchant is Australian — `CURSOR, AI POWERED IDE  SAN FRANCISCO` is the
 * counter-example — and asserting a country the statement never printed is the
 * invention the currency→country map already refuses by omitting EUR. What was
 * missing is a representation for "capture ran and found nothing", not a better
 * guess.
 *
 * So each value names the capture path that ran, which makes a new bank declare
 * what its export can answer instead of inheriting another bank's silence.
 */
export const FX_CAPTURE_SOURCES = [
  /**
   * The Amex long export's `Foreign Spend Amount`/`Commission`/`Country`
   * columns were present on the row. No foreign charge here means domestic,
   * and the merchant country is stated (or was a name the alpha-2 map does not
   * know, which leaves `country` NULL without making the row uncaptured).
   */
  'amex-columns',
  /**
   * An ANZ descriptor was parsed, from a CSV row or a PDF statement line. No
   * foreign charge here means the charge was billed in AUD — it says nothing
   * about where the merchant is, so `country` stays NULL on a domestic row.
   */
  'anz-descriptor',
  /**
   * Capture ran and this row's source shape carries no foreign-charge
   * information at all: the four-column Amex export, and every bank whose CSV
   * states neither a country nor a foreign amount. The NULLs mean "this source
   * cannot say", not "domestic".
   */
  'unavailable',
] as const;

/** The capture path that ran for one row. NULL on a row is not a member — see below. */
export type FxCaptureSource = (typeof FX_CAPTURE_SOURCES)[number];
