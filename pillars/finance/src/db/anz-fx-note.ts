/**
 * Reads back the foreign-charge note the ANZ importer used to write into
 * `transactions.notes` before the typed columns existed.
 *
 * The format was produced by one function, so it is matched literally here:
 *
 *     `${amount} ${currency}, ${fee} AUD fx fee`   e.g. "1 100 JPY, 0.40 AUD fx fee"
 *
 * Zero-decimal currencies carry a SPACE thousands separator straight from ANZ
 * (`1 100 JPY`), which is why the amount cannot be matched with `[\d,.]+` — a
 * pattern that skips those rows matches nothing on a quarter of the data and
 * reports success. Scaling is delegated to the same converter the live parser
 * uses, so a backfilled row and a freshly imported one agree by construction.
 */
import { foreignChargeFromParts, type AnzForeignCharge } from '../contract/anz-description.js';

/**
 * Suffix every note this importer wrote ends with. Used as the candidate filter
 * for the backfill; matching it while failing {@link parseAnzForeignChargeNote}
 * means the format drifted and the migration must abort rather than clear text
 * it could not read.
 */
export const ANZ_FX_NOTE_SUFFIX = ' AUD fx fee';

const ANZ_FX_NOTE = /^(\d[\d, ]*(?:\.\d+)?) ([A-Z]{3}), (\d[\d, ]*(?:\.\d+)?) AUD fx fee$/;

export function parseAnzForeignChargeNote(note: string): AnzForeignCharge | undefined {
  const match = ANZ_FX_NOTE.exec(note);
  if (!match) return undefined;
  return foreignChargeFromParts(match[1] ?? '', match[2] ?? '', match[3] ?? '');
}

/**
 * One field of a parsed note, or null when the note is not one this importer
 * wrote — the shape SQLite can consume, since a registered function returns a
 * scalar.
 */
export function anzForeignChargeNoteField(note: unknown, field: unknown): string | number | null {
  if (typeof note !== 'string') return null;
  const charge = parseAnzForeignChargeNote(note);
  if (!charge) return null;
  switch (field) {
    case 'amount_minor':
      return charge.amountMinor;
    case 'currency':
      return charge.currency;
    case 'fee_cents':
      return charge.feeCents;
    default:
      throw new Error(`finance_anz_fx_note: unknown field ${String(field)}`);
  }
}
