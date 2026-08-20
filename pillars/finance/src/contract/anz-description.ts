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

/** Fields recovered from one ANZ description column. */
export interface AnzDescription {
  /** Merchant name, internal padding collapsed. Never empty. */
  description: string;
  /** Suburb, city or merchant domain, title-cased. Absent when the detail field is a phone number or missing. */
  location?: string;
  /** ISO-3166-1 alpha-2, only for foreign charges whose currency maps to exactly one country. */
  country?: string;
  /** Foreign amount and AUD fee for overseas charges, e.g. `100.00 USD, 5.03 AUD fx fee`. */
  notes?: string;
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

function describeForeignCharge(amount: string, currency: string, fee: string): string {
  return `${collapse(amount)} ${currency}, ${fee} AUD fx fee`;
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
      notes: describeForeignCharge(amount ?? '', currency ?? '', fee ?? ''),
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
