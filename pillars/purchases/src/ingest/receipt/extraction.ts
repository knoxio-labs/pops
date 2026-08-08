/**
 * What a vision model is allowed to say about a receipt.
 *
 * Deliberately small. Every field here is something a human can read off a
 * photograph and check in a second, because everything a model emits has to
 * be checkable — see `gate.ts`. Anything the model would have to *infer*
 * (a category, a merchant id, whether a line is a discount) is absent on
 * purpose: an inference cannot be validated against the paper, so it would
 * be a guess wearing the same clothes as a reading.
 *
 * Money is a string, not a number. The model transcribes what is printed —
 * `$4.50`, `4.50`, `12` — and this layer parses it, so a malformed amount
 * is a parse failure with a location rather than a silent zero.
 */
import { z } from 'zod';

/** One line as the model read it off the receipt. */
export const ExtractedLineSchema = z.object({
  /** Verbatim, including receipt-speak abbreviations. Not normalised here. */
  description: z.string().trim().min(1),
  /** Printed money for the whole line, e.g. `$12.00`. */
  amount: z.string().trim().min(1),
  /**
   * Only when the receipt states one. Absent is different from 1: it means
   * the paper did not say, and inventing a 1 makes a weighed line look like
   * a counted one.
   */
  quantity: z.number().int().positive().optional(),
  /** `$4.50/kg`, `2 @ $3.00` — whatever qualifies the price, verbatim. */
  unitNote: z.string().trim().min(1).optional(),
});

export const ExtractedReceiptSchema = z.object({
  /** As printed at the top. Unknown is a valid outcome, not a failure. */
  merchantName: z.string().trim().min(1).nullable(),
  /**
   * The shop's address, verbatim. Transcription, and the evidence behind
   * {@link ExtractedReceiptSchema.shape.timeZone}.
   */
  address: z.string().trim().min(1).nullable().default(null),
  /**
   * IANA zone the shop is in, e.g. `Australia/Perth`, `America/Chicago`.
   *
   * **The one inference this schema asks for**, and it is deliberate. A
   * receipt never prints its timezone, but placing a purchase in time needs
   * one — and a Perth receipt is two hours from a Sydney one, a US receipt
   * up to fifteen. The alternative is a geo database or asking the user
   * once per foreign receipt. `address` is kept beside it so the inference
   * can be checked against what was actually printed.
   *
   * Defaulted rather than required: these enrich a reading, and a model
   * that omits one should not sink an extraction whose money is perfect.
   */
  timeZone: z.string().trim().min(1).nullable().default(null),
  /**
   * ISO-8601 date as printed, `YYYY-MM-DD`. The model is asked to resolve
   * the receipt's own format rather than this layer guessing whether
   * `07/08/2026` is August or July — the paper often names the month.
   */
  purchasedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u, 'expected YYYY-MM-DD')
    .nullable(),
  /** `HH:MM` in 24-hour form, when the receipt prints one. */
  purchasedAt: z
    .string()
    .regex(/^\d{2}:\d{2}$/u, 'expected HH:MM')
    .nullable(),
  /** ISO-4217, as printed or inferred from the currency symbol. */
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/u, 'expected a three-letter ISO-4217 code')
    .nullable(),
  /** The total the receipt states. This is what the lines are checked against. */
  total: z.string().trim().min(1),
  /** Stated tax, when the receipt separates it. */
  tax: z.string().trim().min(1).nullable(),
  /** Stated discounts, as positive printed amounts. */
  discounts: z.array(z.string().trim().min(1)).default([]),
  lines: z.array(ExtractedLineSchema),
  /**
   * Where the model could not read the paper — a torn corner, a smudged
   * line. Recorded rather than guessed around, because an unreadable line
   * is exactly what makes a sum fail to reconcile, and the reviewer needs
   * to know the difference between "the model is wrong" and "the receipt
   * is damaged".
   */
  unreadable: z.array(z.string().trim().min(1)).default([]),
});

export type ExtractedLine = z.infer<typeof ExtractedLineSchema>;
export type ExtractedReceipt = z.infer<typeof ExtractedReceiptSchema>;

export class ExtractionShapeError extends Error {}

/**
 * Parse whatever the model returned.
 *
 * Models emit JSON wrapped in prose or a fenced block often enough that
 * refusing it would mean discarding good extractions over punctuation. The
 * unwrapping is deliberately narrow: the first balanced `{…}` span. It is
 * not a repair pass — malformed JSON inside the braces still fails, loudly.
 */
export function parseExtraction(raw: string): ExtractedReceipt {
  const json = firstJsonObject(raw);
  if (json === null) {
    throw new ExtractionShapeError('the model returned no JSON object');
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(json);
  } catch (error) {
    throw new ExtractionShapeError(`the model returned unparseable JSON: ${String(error)}`);
  }

  const parsed = ExtractedReceiptSchema.safeParse(decoded);
  if (!parsed.success) {
    // Every fault, not the first. A model that omits four fields has one
    // problem, not four consecutive ones, and reporting them one at a time
    // turns diagnosing it into four round trips.
    const faults = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`
    );
    throw new ExtractionShapeError(faults.join('; '));
  }
  return parsed.data;
}

/** The first balanced brace span, ignoring braces inside strings. */
function firstJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i += 1) {
    const char = raw[i];
    if (escaped) {
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (char === '"') {
      inString = !inString;
    } else if (!inString && char === '{') {
      depth += 1;
    } else if (!inString && char === '}') {
      depth -= 1;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}
