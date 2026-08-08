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
 * locale groups digits after it. A single separator with two trailing
 * digits settles itself too — `1,49` and `1.49` are one-forty-nine either
 * way, since no locale groups digits in twos.
 *
 * The genuinely ambiguous case is a single separator with exactly THREE
 * trailing digits: `1,495` is fourteen-hundred-and-ninety-five where the
 * comma groups, and one-and-a-half where it separates. That is the only
 * place the receipt's currency decides anything.
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

/**
 * A currency symbol at either end: `$`, `€`, `£`, `R$`. Letters are
 * excluded here on purpose.
 *
 * Allowing up to three arbitrary non-digits read `TAX 2.75` as $2.75, and
 * `GST`, `SUB`, `NET` and `VAT` with it — every one of them a label a
 * receipt prints *beside* an amount that is accounted for elsewhere.
 * Admitting one as a line total is how a reading passes the gate while
 * describing a different shop than the paper does.
 */
const SYMBOL_EDGE = String.raw`[^\d\s,.\-A-Za-z]{1,3}`;

/**
 * A currency symbol carrying a country prefix: `AU$`, `US$`, `NZ$`, `R$`.
 *
 * Structural rather than enumerated. A list of these was tried and the
 * first real Australian receipt was refused, because `AU$` was not on it —
 * the list can only ever contain the ones somebody thought of. What makes
 * these money is the shape: Latin letters immediately followed by an actual
 * currency sign (`\p{Sc}`), which `TAX` and `SUB` do not have and cannot
 * acquire by accident. `TAX:` does not qualify either — a colon is not a
 * currency sign.
 */
const PREFIXED_SYMBOL = String.raw`[A-Za-z]{1,3}\p{Sc}`;

/**
 * Currency symbols spelled entirely in Latin letters, which no shape can
 * distinguish from a label.
 *
 * These genuinely have to be listed: nothing separates `kr` from `TAX`
 * except knowing that one is money. Symbols outside the Latin alphabet —
 * `€`, `₩`, `zł`, `Kč` — need no entry, since {@link SYMBOL_EDGE} already
 * admits any non-Latin mark.
 */
const LETTER_SYMBOLS = ['kr', 'RM', 'Rp', 'Rs', 'Ft', 'lei', 'Bs'];

function escapeForRegex(text: string): string {
  return text.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`);
}

/**
 * Letters are a currency marker only when they are *the* currency the
 * receipt stated, or a known symbol. Absent that, `AUD` and `TAX` are
 * indistinguishable, and guessing in favour of money is the expensive
 * direction to be wrong in: a refusal is a located failure a human reviews,
 * while an invented amount is silent.
 */
function currencyEdge(locale: MoneyLocale | undefined): string {
  const alternatives = [PREFIXED_SYMBOL, SYMBOL_EDGE, ...LETTER_SYMBOLS.map(escapeForRegex)];
  const currency = locale?.currency;
  if (typeof currency === 'string' && /^[A-Za-z]{3}$/u.test(currency)) {
    alternatives.push(currency.toUpperCase());
  }
  return `(?:${alternatives.join('|')})`;
}

const MONEY_RE_CACHE = new Map<string, RegExp>();

/**
 * The whole string must be an amount, not merely contain one.
 *
 * An earlier version deleted every non-numeric character and read whatever
 * survived, which turned `TOTAL $27.50` into $27.50 and `1-2` into −12.
 * That contradicts this module's one promise — null for anything that is
 * not money — and let malformed model output through the gate as fact.
 */
function moneyPattern(locale: MoneyLocale | undefined): RegExp {
  const edge = currencyEdge(locale);
  const cached = MONEY_RE_CACHE.get(edge);
  if (cached !== undefined) return cached;

  const pattern = new RegExp(
    `^(?:-\\s*)?(?:${edge}\\s*)?(?:-\\s*)?(?<digits>[\\d.,]+)\\s*(?:${edge})?$`,
    'iu'
  );
  MONEY_RE_CACHE.set(edge, pattern);
  return pattern;
}

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

  const match = moneyPattern(locale).exec(raw.trim());
  if (match === null) return null;
  const text = match.groups?.['digits'] ?? '';
  if (text === '') return null;
  // A minus anywhere before the digits: `-$4.95` and `$-4.95` both occur.
  const negative = raw.slice(0, raw.indexOf(text)).includes('-');

  const split = splitAmount(text, locale);
  if (split === null) return null;
  const [whole, fraction] = split;

  const digits = `${fraction}000`.slice(0, 3);
  const rounded = Number(digits.slice(0, 2)) + (Number(digits.slice(2, 3)) >= 5 ? 1 : 0);
  const cents = Number(whole) * 100 + rounded;
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}
