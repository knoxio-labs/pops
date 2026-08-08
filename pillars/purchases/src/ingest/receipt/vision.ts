/**
 * Asking a model to read a photograph of a receipt.
 *
 * The capability is modelled as a port so the pipeline runs on a real
 * Anthropic client in production and on canned answers in tests. **Tests
 * must never reach a real API**: a test that costs money and needs a
 * network is a test that gets skipped.
 *
 * The port returns the model's raw text and nothing else. Parsing and
 * validation live in `extraction.ts` and `gate.ts`, which are pure — so the
 * hard thinking about whether a reading is admissible is tested against
 * fixtures rather than against whatever a model happened to say that day.
 */

/**
 * What a vision model will accept.
 *
 * Closed, and the single source of it: the upload edge validates against
 * this list and the Anthropic adapter passes the value straight through, so
 * neither has to assert a type the other might not have checked.
 */
export const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export type ReceiptMediaType = (typeof MEDIA_TYPES)[number];

/** A photograph, or a page of a PDF already rasterised. */
export interface ReceiptImage {
  readonly mediaType: ReceiptMediaType;
  readonly dataBase64: string;
}

export interface ReceiptVision {
  /**
   * Read one receipt.
   *
   * Returns the model's raw text, or `null` when the model is unavailable —
   * no API key, transport failure. `null` means "ask a human", never "the
   * receipt is empty".
   */
  read(image: ReceiptImage): Promise<string | null>;
}

/**
 * Every field the model has to fill in, paired with how to fill it.
 *
 * Kept as data rather than prose so `__tests__/read-receipt.test.ts` can
 * assert that the prompt names every key `ExtractedReceiptSchema` requires. Adding a field
 * to the schema without teaching the model about it then fails a test
 * instead of quietly producing extractions that are missing it.
 */
export const PROMPT_FIELDS: Readonly<Record<string, string>> = {
  merchantName: 'the trading name printed at the top, or null if there is none',
  address:
    'the shop address exactly as printed, or null. Do not expand abbreviations or add a country the receipt does not state',
  timeZone:
    'the IANA timezone the shop is in, inferred from the address — "Australia/Perth", "America/Chicago", "Europe/Paris". Null if the address does not narrow it down. This is the ONE field you may infer rather than transcribe',
  purchasedOn:
    "the date as YYYY-MM-DD, or null. Resolve the receipt's own format — many print the month by name, and where they do not, prefer the day-first reading unless the receipt is clearly American",
  purchasedAt: 'the time as HH:MM in 24-hour form, or null',
  currency: 'the ISO-4217 code, inferred from the symbol if unprinted, or null',
  total: 'the total the receipt states, exactly as printed',
  tax: 'tax stated as a separate line, exactly as printed, or null. Do NOT report tax that the receipt says is already included in the prices',
  discounts: 'each stated discount, exactly as printed, as an array',
  lines: 'one entry per product, in printed order',
  description: 'the product text verbatim, including abbreviations. Do not expand or tidy them',
  amount:
    'the money printed for that line, exactly as printed — but the amount ' +
    'only. Many receipts print a tax or department code beside it (ALDI ' +
    'prints a trailing "A", Woolworths a leading "#"); that mark is not ' +
    'part of the money and must not be included',
  quantity:
    'a whole number ONLY when the receipt states a count. Omit it otherwise — omitted means the paper did not say',
  unitNote:
    'any qualifier on the price, verbatim: "2 @ $3.00", "0.202 kg NET @ $2.90/kg". Omit if absent',
  unreadable:
    'a short note for anything you could not read — a torn corner, a smudged line. An empty array if the receipt is fully legible',
};

/**
 * What the model is told.
 *
 * Three instructions carry the weight. **Transcribe, do not interpret** —
 * every field has to be checkable against the paper, and an inference
 * cannot be. **Report what you cannot read** rather than omitting it, since
 * a silently dropped line still lets the remaining ones fail to sum and
 * turns a damaged receipt into an apparently wrong one. And **do not make
 * the arithmetic work** — the sum is checked afterwards precisely because
 * it is evidence the model did not manufacture.
 */
export const EXTRACTION_PROMPT = `You are reading a photograph of a shop receipt. Return ONLY a JSON object — no prose, no code fence.

Transcribe what is printed. Do not interpret, categorise, tidy or expand anything. Every value you return has to be checkable against the photograph by someone holding it. "timeZone" is the single exception and is marked as such below.

Receipts are not always in English. Transcribe every description in its original language and script, exactly as printed — do NOT translate, transliterate or anglicise. A translated line cannot be checked against the paper, and the same product bought twice must read the same both times.

Transcribe amounts exactly as printed too, including the separators. "1.234,56" and "1,234.56" are both real and mean different things; report the characters you see rather than normalising them.

If you cannot read something, say so in "unreadable" rather than omitting it or guessing. A line you silently drop makes a damaged receipt look like a wrongly-read one.

Do NOT adjust any figure to make the totals add up. The arithmetic is checked afterwards, and a mismatch is useful information — a "corrected" one is not.

Fields:
${Object.entries(PROMPT_FIELDS)
  .map(([field, guidance]) => `- ${field}: ${guidance}`)
  .join('\n')}

Return the object and nothing else.`;
