/**
 * ANZ statement description parsing, shared by the CSV importer and the PDF
 * importer so both derive the same fields from the same raw string.
 *
 * ANZ ships one fixed-width text column where other banks ship several. The
 * merchant occupies the first {@link MERCHANT_WIDTH} characters, padded with
 * spaces; everything after it is a detail field holding a suburb, a merchant
 * phone number, or — for overseas charges — the foreign amount, currency and
 * the AUD foreign-transaction fee:
 *
 *     ALDI STORES - MARRICKV    MARRICKVILLE
 *     PP*HUMBLEBUNDL HUMBLEBUND 4029357733
 *     GITHUB  INC.              GITHUB.COM  100.00  USD 5.03 AUD
 *
 * Splitting on a run of two-or-more spaces looks equivalent and is not: real
 * merchant names contain internal double spaces (`GITHUB  INC.`, `NOTION LABS
 * INC.`), so a run-based split truncates them. The fixed offset does not.
 *
 * The offset only holds when the column is actually padded. Bank-generated
 * narratives (`INTEREST CHARGED ON PURCHASES`) are free text that runs through
 * the boundary, so a non-space at the boundary means "no detail field here" and
 * the whole string is the description. That test is what keeps this parser from
 * needing a hardcoded list of narrative strings.
 *
 * IMPORTANT: the description returned here is NOT the dedup identity. Stripping
 * the detail field discards the only thing distinguishing two same-day,
 * same-amount charges at different branches of one merchant, and ANZ carries no
 * reference column to fall back on (see `import-dedup.ts`). Callers must build
 * the dedup key from the raw string and use this result only for storage.
 */

/** Characters ANZ reserves for the merchant before the detail field begins. */
const MERCHANT_WIDTH = 25;

/**
 * Foreign-currency trailer: `<detail>  <amount>  <CCY> <fee> AUD`.
 *
 * The foreign amount separates thousands with a SPACE for zero-decimal
 * currencies (`1 100  JPY`), so it cannot be matched with `\d+` alone — hence
 * the explicit ` \d{3}` groups. Both field separators are runs of two or more
 * spaces, which is what keeps those inner single spaces unambiguous.
 */
const FX_TRAILER =
  /^(.*?)\s{2,}(\d[\d,]*(?: \d{3})*(?:\.\d+)?)\s{2,}([A-Z]{3})\s+(\d[\d,]*(?:\.\d+)?)\s+AUD$/;

/** A detail field of only digits and separators is a merchant phone or terminal id, not a place. */
const NON_PLACE_DETAIL = /^[\d\s+()-]+$/;

/**
 * ISO-4217 minor-unit exponents. A currency absent here has no known scale, so
 * its charge yields no structured foreign amount at all rather than a figure
 * that is silently off by a power of ten — the raw statement line survives on
 * the transaction's `rawRow` either way.
 */
const CURRENCY_MINOR_EXPONENT: Readonly<Record<string, number>> = {
  AUD: 2,
  BRL: 2,
  CAD: 2,
  CHF: 2,
  CNY: 2,
  DKK: 2,
  EUR: 2,
  GBP: 2,
  HKD: 2,
  IDR: 2,
  INR: 2,
  JPY: 0,
  KRW: 0,
  NZD: 2,
  SGD: 2,
  THB: 2,
  USD: 2,
  VND: 0,
  VUV: 0,
};

/** The currency ANZ settles a foreign charge — and its fee — in. */
const SETTLEMENT_CURRENCY = 'AUD';

/** Amount as ANZ writes it: space- or comma-grouped thousands, optional fraction. */
const AMOUNT_TEXT = /^(\d[\d, ]*?)(?:\.(\d+))?$/;

/**
 * Currency → ISO-3166-1 alpha-2, for the currencies this account has actually
 * seen. Deliberately omits EUR: it spans nineteen countries, and guessing one
 * from the charge would invent data the statement never carried.
 */
const CURRENCY_COUNTRY: Readonly<Record<string, string>> = {
  USD: 'US',
  JPY: 'JP',
  BRL: 'BR',
  VUV: 'VU',
  DKK: 'DK',
  KRW: 'KR',
  GBP: 'GB',
  NZD: 'NZ',
  SGD: 'SG',
  CAD: 'CA',
  CHF: 'CH',
  CNY: 'CN',
  HKD: 'HK',
  THB: 'TH',
  IDR: 'ID',
  INR: 'IN',
};

/** What an overseas charge cost abroad, and what ANZ charged to convert it. */
export interface AnzForeignCharge {
  /**
   * Amount charged abroad, in the currency's own ISO-4217 minor units. Rendering
   * it needs {@link AnzForeignCharge.currency}: `1100` is ¥1,100 for JPY (no
   * minor unit) but $11.00 for USD.
   */
  amountMinor: number;
  /** ISO-4217 alpha-3, as printed on the statement. */
  currency: string;
  /**
   * ANZ's foreign-transaction fee in AUD cents. A FEE — around 3% of the charge —
   * not the converted AUD total, which the statement never states separately.
   */
  feeCents: number;
}

/** Fields recovered from one ANZ description column. */
export interface AnzDescription {
  /** Merchant name, internal padding collapsed. Never empty. */
  description: string;
  /** Suburb, city or merchant domain, title-cased. Absent when the detail field is a phone number or missing. */
  location?: string;
  /** ISO-3166-1 alpha-2, only for foreign charges whose currency maps to exactly one country. */
  country?: string;
  /** Set only for an overseas charge whose currency has a known minor-unit scale. */
  foreignCharge?: AnzForeignCharge;
}

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Title-case a place name without breaking domains or hyphenated names:
 * `MARRICKVILLE` → `Marrickville`, `GITHUB.COM` → `Github.com`, `ST PETERS` →
 * `St Peters`. Only leading letters of space-separated words are raised, so the
 * dot in a domain does not start a new word.
 */
function titleCasePlace(value: string): string {
  return value
    .toLowerCase()
    .split(' ')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
}

/**
 * Convert a printed amount to `currency`'s minor units.
 *
 * The exponent comes from the currency, never from how many decimals ANZ
 * happened to print: a fraction shorter than the exponent is padded (`5.4` AUD
 * is 540 cents), and one longer than it is rejected rather than rounded away.
 * Reading the scale off the string instead would make an undecorated `1 100`
 * JPY indistinguishable from 11.00 of a two-decimal currency.
 */
function toMinorUnits(text: string, currency: string): number | undefined {
  const exponent = CURRENCY_MINOR_EXPONENT[currency];
  if (exponent === undefined) return undefined;
  const match = AMOUNT_TEXT.exec(text.trim());
  if (!match) return undefined;
  const whole = (match[1] ?? '').replace(/[, ]/g, '');
  const fraction = match[2] ?? '';
  if (!/^\d+$/.test(whole) || fraction.length > exponent) return undefined;
  const value = Number(`${whole}${fraction.padEnd(exponent, '0')}`);
  return Number.isSafeInteger(value) ? value : undefined;
}

/**
 * Build the structured foreign charge from the trailer's three printed fields,
 * or nothing when either figure cannot be scaled without guessing.
 */
export function foreignChargeFromParts(
  amount: string,
  currency: string,
  fee: string
): AnzForeignCharge | undefined {
  const amountMinor = toMinorUnits(collapse(amount), currency);
  const feeCents = toMinorUnits(collapse(fee), SETTLEMENT_CURRENCY);
  if (amountMinor === undefined || feeCents === undefined) return undefined;
  return { amountMinor, currency, feeCents };
}

/**
 * Title-case a detail field as a place, or return nothing when it holds a
 * merchant phone or terminal id instead. Both a domestic and a foreign charge
 * can carry either, so neither branch may skip this test.
 */
function asLocation(detail: string): string | undefined {
  const place = collapse(detail);
  if (!place || NON_PLACE_DETAIL.test(place)) return undefined;
  return titleCasePlace(place);
}

function parseDetail(detail: string): Omit<AnzDescription, 'description'> {
  const foreign = FX_TRAILER.exec(detail);
  if (foreign) {
    const [, place, amount, currency, fee] = foreign;
    return {
      location: asLocation(place ?? ''),
      country: CURRENCY_COUNTRY[currency ?? ''],
      foreignCharge: foreignChargeFromParts(amount ?? '', currency ?? '', fee ?? ''),
    };
  }
  return { location: asLocation(detail) };
}

/**
 * Split one ANZ description column into its stored fields.
 *
 * Returns the whole string as the description — with no location — whenever the
 * fixed-width layout does not apply, which covers bank narratives and any short
 * merchant that never reached the detail column.
 */
export function parseAnzDescription(raw: string): AnzDescription {
  const value = raw.replace(/\r/g, '').trimEnd();
  const isPadded = value.length > MERCHANT_WIDTH && value[MERCHANT_WIDTH] === ' ';
  if (!isPadded) return { description: collapse(value) };

  const description = collapse(value.slice(0, MERCHANT_WIDTH));
  if (!description) return { description: collapse(value) };

  return { description, ...parseDetail(value.slice(MERCHANT_WIDTH)) };
}
