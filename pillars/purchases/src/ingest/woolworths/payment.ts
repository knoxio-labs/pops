import { parseAmountCents } from './rows.js';

/**
 * Reading how the shop was paid for — and discarding most of what the
 * receipt says about it.
 *
 * `payments[].details[]` is the EFTPOS terminal slip, verbatim:
 *
 * ```
 * MERCH ID:611000602001034
 * AMERICAN EXPRESS
 * AID           A00000002501090 1
 * TVR                   0000008000
 * ARQC      106CBC37A006B0BA
 * CARD: .............6895   T
 * ```
 *
 * Only the scheme and the last four digits survive into the database. The
 * merchant and terminal ids, the AID, the ARQC and the TVR are cryptographic
 * and identifying, they buy this pillar nothing — matching against finance
 * is done on amount and date — and the cheapest way to never leak them is
 * to never store them.
 */
import type { ReceiptPayment } from './blocks.js';

/** `X-6895` on the payment, `CARD: ......6895` on the slip. */
const LAST_FOUR_RE = /(\d{4})\s*\w?\s*$/u;

const SCHEMES = new Map<RegExp, string>([
  [/american\s+express|\bamex\b/iu, 'AMEX'],
  [/mastercard|\bmc\b/iu, 'Mastercard'],
  [/\bvisa\b/iu, 'Visa'],
  [/\beftpos\b|savings|cheque/iu, 'EFTPOS'],
]);

export interface PaymentReading {
  /** `AMEX ····6895`, or null when nothing identifiable was on the slip. */
  readonly hint: string | null;
  readonly isCash: boolean;
  readonly amountCents: number | null;
}

function readScheme(lines: readonly string[]): string | null {
  for (const line of lines) {
    for (const [pattern, scheme] of SCHEMES) {
      if (pattern.test(line)) return scheme;
    }
  }
  return null;
}

function readLastFour(description: string, lines: readonly string[]): string | null {
  const fromDescription = LAST_FOUR_RE.exec(description.trim());
  if (fromDescription !== null) return fromDescription[1] ?? null;
  const cardLine = lines.find((line) => /card\s*:/iu.test(line));
  return cardLine === undefined ? null : (LAST_FOUR_RE.exec(cardLine.trim())?.[1] ?? null);
}

/**
 * Pick the payment that actually moved money.
 *
 * `Change` is listed as a payment of $0.00 on card receipts and as a real
 * amount on cash ones; either way it is money coming back, so taking the
 * first entry blindly would describe an $8 cash shop as a $2 one.
 */
export function readPayment(payments: readonly ReceiptPayment[] | null): PaymentReading {
  const empty: PaymentReading = { hint: null, isCash: false, amountCents: null };
  if (payments === null) return empty;

  for (const payment of payments) {
    const description = payment.description ?? '';
    if (/change/iu.test(description)) continue;

    const amountCents = parseAmountCents(payment.amount);
    const lines = (payment.details ?? []).map((detail) => detail.text ?? '');

    if (/cash/iu.test(description) || lines.some((line) => /^\s*cash\b/iu.test(line))) {
      return { hint: null, isCash: true, amountCents };
    }

    const scheme = readScheme(lines);
    const lastFour = readLastFour(description, lines);
    if (scheme === null && lastFour === null) continue;

    const label = [scheme, lastFour === null ? null : `····${lastFour}`]
      .filter((part) => part !== null)
      .join(' ');
    return { hint: label, isCash: false, amountCents };
  }

  return empty;
}
