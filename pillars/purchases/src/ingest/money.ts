/**
 * Reading printed money, from any receipt, in any locale.
 *
 * Two conventions split the world and disagree about the same characters:
 * `1.234,56` in Paris is `1,234.56` in Sydney, and `1,49` is one-forty-nine
 * in one and one-hundred-and-forty-nine in the other. Getting it wrong is
 * not a rounding error — it is a hundredfold one.
 *
 * Most amounts settle themselves. A number carrying BOTH separators states
 * its own convention: whichever comes last is the decimal point, because no
 * locale groups digits after it. Only a single separator with two trailing
 * digits is genuinely ambiguous, and that is where the receipt's currency
 * decides.
 *
 * Shared by every adapter: the Everyday Rewards payload prints `18.48` and
 * `-4.95`, a photographed till slip prints `$18.48` and `-$4.95`, and a
 * French supermarket prints `12,49` — sign, symbol and separator all in
 * different places.
 */

/**
 * Currencies whose home locales write the decimal separator as a comma.
 *
 * Not exhaustive and does not need to be: it only has to decide the
 * genuinely ambiguous case, and an unlisted currency falls through to the
 * dot convention, which is what an unlisted currency is most likely to use.
 * Listed here rather than derived from `Intl` because the mapping wanted is
 * currency → convention, and `Intl` keys on locale, which a receipt does
 * not state.
 */
const COMMA_DECIMAL_CURRENCIES = new Set([
  'EUR',
  'BRL',
  'ARS',
  'CLP',
  'COP',
  'DKK',
  'SEK',
  'NOK',
  'ISK',
  'PLN',
  'CZK',
  'HUF',
  'RON',
  'BGN',
  'HRK',
  'RSD',
  'TRY',
  'UAH',
  'RUB',
  'VND',
  'IDR',
]);

export interface MoneyLocale {
  /** ISO-4217 from the receipt. Null when it does not say. */
  readonly currency?: string | null;
}

function usesCommaDecimal(locale: MoneyLocale | undefined): boolean {
  const currency = locale?.currency;
  return typeof currency === 'string' && COMMA_DECIMAL_CURRENCIES.has(currency.toUpperCase());
}

/**
 * Both separators present, so the number states its own convention: the
 * later one is the decimal point, because nothing groups digits after a
 * decimal separator. Needs no locale at all.
 */
function splitStated(text: string, lastDot: number, lastComma: number): [string, string] | null {
  const decimalAt = Math.max(lastDot, lastComma);
  const groupChar = decimalAt === lastDot ? ',' : '.';
  const whole = text.slice(0, decimalAt).replaceAll(groupChar, '');
  const fraction = text.slice(decimalAt + 1);
  if (!/^\d+$/u.test(whole) || !/^\d+$/u.test(fraction)) return null;
  return [whole, fraction];
}

/**
 * One separator, which is where the conventions actually collide.
 *
 * **Grouping always takes exactly three digits**, so two digits after a
 * separator is a decimal fraction whichever character precedes them —
 * `1,49` cannot be a grouped thousand in any locale. That settles what
 * looked like it needed to know where the receipt was from, which matters
 * because the currency is the field most often missing.
 */
function splitSingle(
  before: string,
  after: string,
  separator: ',' | '.',
  locale: MoneyLocale | undefined
): [string, string] | null {
  if (!/^\d+$/u.test(before) || !/^\d+$/u.test(after)) return null;
  if (after.length !== 3) return [before, after];

  // A grouped thousand cannot lead with zero: nobody writes `0,585` meaning
  // five hundred and eighty-five. So `0.585` is a fraction — which is how
  // per-kilo pricing reaches three decimals, and reading it as grouping
  // turned 58 cents of oranges into $585.
  if (Number(before) === 0) return [before, after];

  // What remains is the real ambiguity: `1,495` is fifteen hundred grouped,
  // or one-point-four-nine-five in a three-decimal currency. Grouping is far
  // more common on a till slip, and the locale breaks the tie only when the
  // separator is the one that locale writes decimals with.
  const decimalHere = separator === ',' ? usesCommaDecimal(locale) : !usesCommaDecimal(locale);
  return decimalHere && locale?.currency != null ? [before, after] : [`${before}${after}`, ''];
}

/** Split a digits-and-separators string into whole and fractional parts. */
function splitAmount(text: string, locale: MoneyLocale | undefined): [string, string] | null {
  if (!/^[\d.,]+$/u.test(text) || !/\d/u.test(text)) return null;

  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) return splitStated(text, lastDot, lastComma);

  const only = lastDot === -1 ? lastComma : lastDot;
  if (only === -1) return [text, ''];
  return splitSingle(text.slice(0, only), text.slice(only + 1), lastDot === -1 ? ',' : '.', locale);
}

/**
 * `8.00`, `$8.00`, `-$4.95`, `$-4.95`, `1,495.00`, and — given a
 * comma-decimal currency — `12,49` and `1.234,56`.
 *
 * Null for anything that is not money. A receipt line that is not money is
 * a fact worth reporting; a silent zero is a shop that quietly costs less
 * than it did.
 */
export function parseAmountCents(
  raw: string | null | undefined,
  locale?: MoneyLocale
): number | null {
  if (raw === null || raw === undefined) return null;

  // Sign and currency symbol appear in both orders and on either side, so
  // both are lifted off wherever they sit rather than matched at a fixed
  // position.
  const trimmed = raw.trim();
  const negative = trimmed.includes('-');
  const text = trimmed.replaceAll(/[^\d.,]/gu, '');
  if (text === '') return null;

  const split = splitAmount(text, locale);
  if (split === null) return null;
  const [whole, fraction] = split;

  const digits = `${fraction}000`.slice(0, 3);
  const rounded = Number(digits.slice(0, 2)) + (Number(digits.slice(2, 3)) >= 5 ? 1 : 0);
  const cents = Number(whole) * 100 + rounded;
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}
