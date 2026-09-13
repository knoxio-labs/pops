/**
 * The receipt's currency, read or inferred, never invented.
 *
 * The extraction asks the model for the ISO-4217 code inferred from the
 * printed symbol, or `null` when it cannot tell. A `null` used to become
 * `AUD` unconditionally, which was right for an Australian receipt and a
 * silent corruption for anything else — a BRL cash slip with no printed
 * symbol became an AUD purchase, off by roughly a factor of three.
 *
 * `null` is now resolved against the one other location signal the same
 * extraction already produces: the IANA timezone inferred from the printed
 * address. A recognised zone decides the currency; an unrecognised or
 * absent one is genuinely no signal, and gets {@link UNRESOLVED_CURRENCY}
 * — ISO 4217's own code for "no currency stated" — rather than a fallback
 * that happened to be right often enough to go unnoticed. Either way the
 * result is marked uncertain, so an inferred or unresolved currency is
 * never mistaken for one the receipt actually stated.
 */
import type { ExtractedReceipt } from './extraction.js';

/**
 * The extraction said it could not read a currency, and the resolution
 * below is either a guess from the timezone or no signal at all. Not
 * applied when the extraction stated a currency outright.
 */
export const CURRENCY_UNCERTAIN = 'currency-uncertain';

/**
 * ISO 4217's own answer to "no currency was stated": the code reserved for
 * transactions where none applies. Storing it is not a guess wearing a
 * currency's clothes the way `AUD` was — it is the standard's own way of
 * saying the field is unresolved, which {@link CURRENCY_UNCERTAIN} then
 * flags for a human.
 */
const UNRESOLVED_CURRENCY = 'XXX';

/**
 * Currency for the IANA zones a receipt has actually arrived from without
 * stating its own currency.
 *
 * Deliberately partial, the same way `COMMA_DECIMAL_CURRENCIES` in
 * `../money.ts` is: it only has to cover zones this pipeline has seen, and
 * an unlisted zone falls through to {@link UNRESOLVED_CURRENCY} rather than
 * a wrong currency wearing a right one's clothes. Every Australian zone is
 * listed too, even though `AUD` was always going to be the answer there —
 * without an entry, an Australian receipt with no stated currency would
 * read as "uncertain" for no reason.
 */
const TIMEZONE_CURRENCY: Readonly<Record<string, string>> = {
  'Australia/Sydney': 'AUD',
  'Australia/Melbourne': 'AUD',
  'Australia/Brisbane': 'AUD',
  'Australia/Perth': 'AUD',
  'Australia/Adelaide': 'AUD',
  'Australia/Darwin': 'AUD',
  'Australia/Hobart': 'AUD',
  'Australia/Broken_Hill': 'AUD',
  'Australia/Lord_Howe': 'AUD',
  'Australia/Lindeman': 'AUD',
  'Australia/Currie': 'AUD',
  'Australia/Eucla': 'AUD',
  'America/Sao_Paulo': 'BRL',
  'America/Bahia': 'BRL',
  'America/Fortaleza': 'BRL',
  'America/Recife': 'BRL',
  'America/Maceio': 'BRL',
  'America/Araguaina': 'BRL',
  'America/Belem': 'BRL',
  'America/Santarem': 'BRL',
  'America/Manaus': 'BRL',
  'America/Boa_Vista': 'BRL',
  'America/Porto_Velho': 'BRL',
  'America/Rio_Branco': 'BRL',
  'America/Cuiaba': 'BRL',
  'America/Campo_Grande': 'BRL',
  'America/Noronha': 'BRL',
};

/** What the receipt states for its own currency, or the closest honest guess. */
export interface ResolvedCurrency {
  readonly currency: string;
  /** True unless the extraction stated a currency outright. */
  readonly uncertain: boolean;
}

export function resolveCurrency(extracted: ExtractedReceipt): ResolvedCurrency {
  if (extracted.currency !== null) return { currency: extracted.currency, uncertain: false };
  const fromZone = extracted.timeZone === null ? undefined : TIMEZONE_CURRENCY[extracted.timeZone];
  return { currency: fromZone ?? UNRESOLVED_CURRENCY, uncertain: true };
}
