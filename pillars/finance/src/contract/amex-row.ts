/**
 * Amex CSV export parsing, for the fields its columns hold but the import
 * wizard's column mapper cannot express.
 *
 * Amex ships two export shapes from the same portal. The short one is four
 * columns — `Date,Date Processed,Description,Amount` — and carries no foreign
 * detail at all. The long one adds ten more, of which three matter here:
 *
 *     Foreign Spend Amount   Commission   Country
 *     5.50 USD               0.27         SINGAPORE
 *
 * A row of the short shape, or a domestic row of the long one, leaves the
 * foreign columns empty. Both are read here as "no foreign charge", which is
 * correct for the domestic row and is all that can be said about the short one.
 *
 * Unlike ANZ — which prints no country and has one inferred from the charge
 * currency — Amex states the MERCHANT's country, which is the better datum and
 * not always the currency's: the sample foreign charge is a Singapore merchant
 * billing USD.
 */
import { foreignChargeFromParts, type AnzForeignCharge } from './anz-description.js';

/** Long-form column names. Absent from the short export, which is not an error. */
const FOREIGN_SPEND_COLUMN = 'Foreign Spend Amount';
const COMMISSION_COLUMN = 'Commission';
const COUNTRY_COLUMN = 'Country';

/** `<amount> <CCY>`, e.g. `5.50 USD`. The amount's own grammar is the converter's problem. */
const FOREIGN_SPEND = /^(.+?)\s+([A-Z]{3})$/;

/**
 * Amex country name → ISO-3166-1 alpha-2, so the column agrees with the ANZ
 * parser's alpha-2 rather than storing two spellings of one field.
 *
 * Amex mostly prints the ISO-3166 short name in caps, but not always — the UK
 * arrives as `UNITED KINGDOM OF GB AND NI`, which no standard list contains.
 * An unrecognised name therefore yields no country at all rather than a guess;
 * the raw export survives on the transaction's `rawRow` either way.
 */
const COUNTRY_ALPHA2: Readonly<Record<string, string>> = {
  AUSTRALIA: 'AU',
  BRAZIL: 'BR',
  CANADA: 'CA',
  CHINA: 'CN',
  DENMARK: 'DK',
  FRANCE: 'FR',
  GERMANY: 'DE',
  'HONG KONG': 'HK',
  INDIA: 'IN',
  INDONESIA: 'ID',
  IRELAND: 'IE',
  ITALY: 'IT',
  JAPAN: 'JP',
  NETHERLANDS: 'NL',
  'NEW ZEALAND': 'NZ',
  SINGAPORE: 'SG',
  SPAIN: 'ES',
  SWITZERLAND: 'CH',
  THAILAND: 'TH',
  'UNITED KINGDOM': 'GB',
  'UNITED KINGDOM OF GB AND NI': 'GB',
  'UNITED STATES': 'US',
  'UNITED STATES OF AMERICA': 'US',
  VANUATU: 'VU',
  VIETNAM: 'VN',
};

/** Fields recovered from one Amex export row beyond the mapped columns. */
export interface AmexRowFields {
  /** ISO-3166-1 alpha-2 of the merchant's country, when Amex named one this map knows. */
  country?: string;
  /** Set only for a charge that states both a foreign amount and its commission. */
  foreignCharge?: AnzForeignCharge;
}

function cell(row: Record<string, string>, column: string): string {
  return (row[column] ?? '').trim();
}

/**
 * Read the foreign charge out of an Amex row.
 *
 * Both fields are required. `Foreign Spend Amount` without `Commission` is not
 * read as a fee-free charge: the fee is the figure this whole capture exists to
 * make visible, and defaulting it to zero would report a foreign charge as
 * having cost nothing to convert — a wrong number is worse here than a missing
 * one, which at least reads as uncaptured.
 */
function foreignCharge(row: Record<string, string>): AnzForeignCharge | undefined {
  const spend = cell(row, FOREIGN_SPEND_COLUMN);
  const commission = cell(row, COMMISSION_COLUMN);
  if (!spend || !commission) return undefined;
  const match = FOREIGN_SPEND.exec(spend);
  if (!match) return undefined;
  return foreignChargeFromParts(match[1] ?? '', match[2] ?? '', commission);
}

/**
 * Split one Amex export row into the fields its extra columns hold.
 *
 * The country is returned for a domestic charge too. That is deliberate: it is
 * what lets a reader tell a genuinely domestic row (`country` `AU`, no foreign
 * charge) from one imported before this capture existed (`country` NULL), which
 * a foreign-only country would leave indistinguishable.
 */
export function parseAmexRow(row: Record<string, string>): AmexRowFields {
  return {
    country: COUNTRY_ALPHA2[cell(row, COUNTRY_COLUMN).toUpperCase()],
    foreignCharge: foreignCharge(row),
  };
}
