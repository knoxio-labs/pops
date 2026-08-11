/**
 * Asking a model to read a receipt.
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
 *
 * A receipt does not always arrive as paper. A photographed till slip, a
 * merchant's PDF tax invoice and the body of an order-confirmation email are
 * the same problem — a document that states its own total — so they take the
 * same path and are checked by the same gate. Only the intake shape and a
 * paragraph of the prompt differ.
 */

/** What a vision model will accept as a picture. */
export const IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

/**
 * Everything the drop-zone accepts.
 *
 * Closed, and the single source of it: the upload edge validates against
 * this list and the Anthropic adapter maps each entry to a content block, so
 * neither has to assert a type the other might not have checked.
 *
 * `text/plain` arrives base64-encoded like everything else rather than as a
 * bare string. One representation means one content-addressed store, one
 * dedup key and one edge check for every shape — the alternative forks the
 * pipeline from the contract down to keep a client from calling
 * `TextEncoder`.
 */
export const MEDIA_TYPES = [...IMAGE_MEDIA_TYPES, 'application/pdf', 'text/plain'] as const;

export type ReceiptImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];
export type ReceiptMediaType = (typeof MEDIA_TYPES)[number];

/**
 * What the media type implies for everything downstream: which content block
 * carries it, which magic number identifies it, which paragraph of the
 * prompt applies. Derived rather than declared, so an upload cannot claim a
 * kind its bytes do not match.
 */
export type ReceiptKind = 'image' | 'pdf' | 'text';

/**
 * Total, and deliberately not a fallback.
 *
 * Written as a record over every accepted media type so that adding one to
 * {@link MEDIA_TYPES} without deciding what it is fails to compile. A
 * `return 'text'` for anything unrecognised would have been shorter and
 * would have silently sent the next media type — `text/html`, say — to the
 * model as a plain-text document, under the prompt written for pasted email
 * bodies, and named it "Text" in its refusals.
 */
const KINDS: Readonly<Record<ReceiptMediaType, ReceiptKind>> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'application/pdf': 'pdf',
  'text/plain': 'text',
};

/**
 * Narrowing, for the one place that needs the image types as their own
 * union: an image content block accepts four media types and not six.
 */
export function isImageMediaType(mediaType: ReceiptMediaType): mediaType is ReceiptImageMediaType {
  return IMAGE_MEDIA_TYPES.some((candidate) => candidate === mediaType);
}

export function kindOf(mediaType: ReceiptMediaType): ReceiptKind {
  return KINDS[mediaType];
}

/** One piece of what was uploaded: a photograph, a PDF, or a pasted body. */
export interface ReceiptPart {
  readonly mediaType: ReceiptMediaType;
  readonly dataBase64: string;
}

export interface ReceiptVision {
  /**
   * Read one receipt from one or more parts of it.
   *
   * A till receipt for a full shop does not fit in one frame, so the parts
   * are an ordered sequence covering a single receipt — top to bottom — not
   * several receipts.
   *
   * Returns the model's raw text, or `null` when the model is unavailable —
   * no API key, transport failure. `null` means "ask a human", never "the
   * receipt is empty".
   */
  read(parts: readonly ReceiptPart[]): Promise<string | null>;
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
  merchantName: 'the trading name stated at the top, or null if there is none',
  address:
    'the shop address exactly as stated, or null. Do not expand abbreviations or add a country the receipt does not state',
  timeZone:
    'the IANA timezone the shop is in, inferred from the address — "Australia/Perth", "America/Chicago", "Europe/Paris". Null if the address does not narrow it down. This is the ONE field you may infer rather than transcribe',
  purchasedOn:
    "the date as YYYY-MM-DD, or null. Resolve the receipt's own format — many state the month by name, and where they do not, prefer the day-first reading unless the receipt is clearly American",
  purchasedAt: 'the time as HH:MM in 24-hour form, or null',
  currency: 'the ISO-4217 code, inferred from the symbol if unstated, or null',
  total: 'the total the receipt states, exactly as stated',
  tax: 'tax stated as a separate line, exactly as stated, or null. Do NOT report tax that the receipt says is already included in the prices',
  discounts:
    'each stated discount as an array — the amount only, without the wording ' +
    'stated beside it. A receipt that lists a discount and then repeats it ' +
    'in a totals line has stated one discount, so report it once',
  surcharges:
    'each fee the merchant added as an array — a card or credit surcharge, ' +
    'a small-order fee, a service charge. The amount only, without the ' +
    'wording stated beside it. These are added to the total, not subtracted ' +
    'like a discount, and neither tax nor delivery belongs here: a delivery, ' +
    'postage or shipping charge belongs in the separate "shipping" field ' +
    'below and must NOT also appear in this array. A receipt that names a ' +
    'fee and then repeats it in a totals line has charged one fee, so ' +
    'report it once',
  shipping:
    'the delivery, postage or shipping charge stated, exactly as stated, or ' +
    'null. Null unless an amount of money is stated — a receipt printing ' +
    '"FREE", "Delivery: included" or nothing at all has stated no amount, ' +
    'and the word alone is not money. "$0.00" is an amount and may be ' +
    'reported. Report it here and not in "surcharges"',
  lines: 'one entry per product, in the order the receipt lists them',
  description: 'the product text verbatim, including abbreviations. Do not expand or tidy them',
  amount:
    'the money stated for that line, exactly as stated — but the amount ' +
    'only. Many receipts print a tax or department code beside it (ALDI ' +
    'prints a trailing "A", Woolworths a leading "#"); that mark is not ' +
    'part of the money and must not be included',
  quantity:
    'a whole number ONLY when the receipt states a count. Omit it otherwise — omitted means the source did not say',
  unitNote:
    'any qualifier on the price, verbatim: "2 @ $3.00", "0.202 kg NET @ $2.90/kg". Omit if absent',
  unreadable:
    'a short note for anything you could not read — a torn corner, a smudged line, a garbled section. An empty array if the receipt is fully legible',
};

/**
 * What each intake shape needs said about it, and nothing more.
 *
 * These are not stylistic variants. Each names the specific way its shape
 * lies: photographs repeat lines where they overlap, invoices surround the
 * purchase with letterhead and terms, and an email body is mostly not the
 * receipt at all. A prompt that omitted them would produce readings that
 * fail the gate for reasons the model was never warned about.
 */
const KIND_NOTES: Readonly<Record<ReceiptKind, string>> = {
  image: `The images are photographs of ONE receipt, in order from top to bottom because it is too long for a single frame — not several receipts. Read them as one document: one merchant, one date, one total, and every line from every image in the order they appear.

Consecutive photographs usually overlap, so the last lines of one image are often the first lines of the next. A line that appears in two images is ONE line and must be reported once. Do not report it twice, and do not drop it because you have seen it before.

Take the total, the tax and the date from wherever they are stated — usually the last image. If a part of the receipt is missing between images, do not invent the lines that would fill the gap: report what you can read and the arithmetic check will show something is missing.`,

  pdf: `The PDF is ONE receipt or tax invoice. Read every page and treat them as one document: one merchant, one date, one total, and every line in the order it appears.

An invoice carries a great deal that was never bought — a letterhead, a billing and a delivery address, an ABN or company number, payment terms, page numbers, a footer, terms and conditions. None of that is a line item. Report a row only when it names something purchased and the money charged for it.`,

  text: `The text is ONE receipt or order confirmation as it arrived, usually the body of an email pasted verbatim.

It carries a great deal that was never bought: markup or layout left over from the mail, tracking and unsubscribe links, delivery estimates, recommendations, account and marketing footers. None of that is a line item. Report a row only when it names something purchased and the money charged for it.

If the message quotes an earlier message as well as the order it is about — a forward, or a reply chain — read only the order it is about.`,
};

/**
 * What is true of every reading regardless of how the receipt arrived.
 *
 * Three instructions carry the weight. **Transcribe, do not interpret** —
 * every field has to be checkable against the source, and an inference
 * cannot be. **Report what you cannot read** rather than omitting it, since
 * a silently dropped line still lets the remaining ones fail to sum and
 * turns a damaged receipt into an apparently wrong one. And **do not make
 * the arithmetic work** — the sum is checked afterwards precisely because
 * it is evidence the model did not manufacture.
 */
const SHARED_INSTRUCTIONS = `Transcribe what the receipt states. Do not interpret, categorise, tidy or expand anything. Every value you return has to be checkable against the source by someone looking at it. "timeZone" is the single exception and is marked as such below.

Receipts are not always in English. Transcribe every description in its original language and script, exactly as stated — do NOT translate, transliterate or anglicise. A translated line cannot be checked against the source, and the same product bought twice must read the same both times.

Transcribe amounts exactly as stated too, including the separators. "1.234,56" and "1,234.56" are both real and mean different things; report the characters you see rather than normalising them.

If you cannot read something, say so in "unreadable" rather than omitting it or guessing. A line you silently drop makes a damaged receipt look like a wrongly-read one.

Do NOT adjust any figure to make the totals add up. The arithmetic is checked afterwards, and a mismatch is useful information — a "corrected" one is not.`;

/** Fixed, so the same upload always produces byte-identical instructions. */
const KIND_ORDER: readonly ReceiptKind[] = ['image', 'pdf', 'text'];

/**
 * The instructions for one submission.
 *
 * Composed from the kinds actually uploaded rather than switched on a single
 * one, because a submission is an ordered list and nothing stops it holding
 * a photograph of the till slip beside the PDF the merchant emailed. Each
 * kind present contributes its own hazards and no others: telling a model
 * reading a PDF about overlapping frames invents a problem it does not have.
 */
export function extractionPrompt(mediaTypes: readonly ReceiptMediaType[]): string {
  const present = new Set(mediaTypes.map(kindOf));
  const notes = KIND_ORDER.filter((kind) => present.has(kind)).map((kind) => KIND_NOTES[kind]);

  return [
    'You are reading ONE purchase receipt. Return ONLY a JSON object — no prose, no code fence.',
    ...notes,
    SHARED_INSTRUCTIONS,
    `Fields:\n${Object.entries(PROMPT_FIELDS)
      .map(([field, guidance]) => `- ${field}: ${guidance}`)
      .join('\n')}`,
    'Return the object and nothing else.',
  ].join('\n\n');
}
