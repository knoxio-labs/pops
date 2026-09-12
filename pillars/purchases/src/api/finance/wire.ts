/**
 * The finance transaction wire shape, and the money boundary around it.
 *
 * Finance persists integer cents but publishes **decimal dollars** — its
 * `pillars/finance/src/money.ts` converts with `cents / 100` at the REST
 * edge, and the wire field is a plain `number`. This pillar's entire
 * premise is the opposite: subset-sum in the reconciliation ladder is exact
 * over integers and is not exact over anything else.
 *
 * So the dollar float is converted to cents HERE, at the boundary, and
 * nothing downstream ever sees `amount`. That is the whole reason this file
 * exists rather than the client mapping rows inline.
 */
import { z } from 'zod';

const CENTS_PER_DOLLAR = 100;

/**
 * The currency every `amount` finance publishes is denominated in.
 *
 * Finance states no settlement currency on the wire — its ledger is
 * single-currency and its own importers hardcode the same constant (the ANZ
 * statement parser calls it `SETTLEMENT_CURRENCY`). Naming it once here is
 * what lets the solver COMPARE currencies instead of assuming two integers
 * are the same kind of thing. When finance begins publishing the field,
 * this constant is the one place that has to change.
 */
export const FINANCE_SETTLEMENT_CURRENCY = 'AUD';

/**
 * Convert a decimal-dollar amount to integer cents.
 *
 * Rounds rather than truncates, matching finance's own `dollarsToCents` and
 * for the same reason: `19.99` has no exact IEEE-754 representation, and
 * truncating `19.99 * 100 = 1998.9999...` lands a cent short. Over a
 * thousand candidate transactions that is a thousand chances to make a
 * correct match look like a one-cent mismatch.
 *
 * Duplicated rather than imported: `purchases` takes no dependency on
 * `@pops/finance` (no backend pillar depends on another pillar's package),
 * and the pillar-SDK proxy is untyped at the network edge, so importing
 * would buy no compile-time safety anyway.
 */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * CENTS_PER_DOLLAR);
}

/**
 * The subset of finance's transaction wire shape this pillar reads.
 *
 * Validated rather than trusted. `pillar<TRouter>()` is typed by the
 * CALLER — the proxy resolves routes from the producer's OpenAPI at
 * runtime — so the local router type is an assertion, not a check. For a
 * name lookup that is tolerable; for the numbers a subset-sum runs on it is
 * not: a producer-side shape change would surface as wrong arithmetic
 * rather than as a failure. This schema is the substitute for the
 * compile-time link that does not exist.
 */
export const FinanceTransactionWireSchema = z.object({
  id: z.string(),
  description: z.string(),
  /**
   * The producer's field is `accountId`, and it always was.
   *
   * This schema asked for `account`, which finance has never served, so
   * every page failed validation and every sweep treated its whole window
   * as unreadable — the degradation this file's own comment describes,
   * fired permanently rather than during an outage. Nothing downstream ever
   * read the value, which is why it cost a silent outage rather than a
   * wrong answer.
   */
  accountId: z.string(),
  /** DECIMAL DOLLARS, not cents. Converted at the boundary; never propagated. */
  amount: z.number(),
  /**
   * Date-only `YYYY-MM-DD`, and enforced as such.
   *
   * The window this leg queries is expressed in the same form, and the
   * ladder compares it against `purchase.orderedAt`. A producer that began
   * emitting a full timestamp would pass a bare `z.string()` and then sort
   * and compare differently — a drift that changes which transactions fall
   * inside a 14–21 day window without ever failing.
   */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'expected a date-only YYYY-MM-DD value'),
  /**
   * Left deliberately open.
   *
   * Finance's transaction type is a closed vocabulary, but pinning it here
   * would mean finance could not ADD a type without this leg rejecting
   * every transaction in the window — turning a routine producer change
   * into a fleet-wide reconciliation outage. Nothing here branches on
   * `type`; it is carried for the solver's blocking stage, which treats an
   * unfamiliar value as simply not matching.
   */
  type: z.string(),
  entityId: z.string().nullable(),
  entityName: z.string().nullable(),
  /**
   * What the issuer says was charged abroad, in `foreignCurrency`'s own
   * ISO-4217 minor units. ANZ, Amex and Up all record it; the rest of
   * finance's importers do not.
   *
   * Tolerated absent, unlike `amount`. An absent foreign amount and a null
   * one mean the same thing — nobody captured one — and that reads as a
   * refusal to match across currencies, which is the safe direction. An
   * absent `amount` would read as a missing number the arithmetic needs,
   * which is why that one stays required.
   */
  foreignAmountMinor: z.number().int().nullish(),
  /** ISO-4217 alpha-3 of the charge abroad, tolerated absent for the same reason. */
  foreignCurrency: z.string().nullish(),
});

export const FinanceListResponseSchema = z.object({
  data: z.array(FinanceTransactionWireSchema),
  pagination: z.object({
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
    hasMore: z.boolean(),
  }),
});

/**
 * A transaction as the reconciliation ladder consumes it: integer cents,
 * and a `pops://` URI ready to store on a charge link. Deliberately has no
 * `amount` field at all, so a dollar value cannot reach the solver by
 * being passed through.
 */
export interface CandidateTransaction {
  readonly id: string;
  readonly uri: string;
  readonly description: string;
  readonly accountId: string;
  readonly amountCents: number;
  /** {@link FINANCE_SETTLEMENT_CURRENCY} — what `amountCents` is stated in. */
  readonly settlementCurrency: string;
  /** The issuer's foreign amount in its own minor units, or null when none was captured. */
  readonly foreignAmountMinor: number | null;
  /** ISO-4217 of that foreign amount, or null. */
  readonly foreignCurrency: string | null;
  readonly date: string;
  readonly type: string;
  readonly entityId: string | null;
  readonly entityName: string | null;
}

/** Soft cross-pillar reference to a finance transaction (ADR-012, ADR-042). */
export function financeTransactionUri(id: string): string {
  return `pops://finance/transaction/${id}`;
}

export function toCandidateTransaction(
  wire: z.infer<typeof FinanceTransactionWireSchema>
): CandidateTransaction {
  return {
    id: wire.id,
    uri: financeTransactionUri(wire.id),
    description: wire.description,
    accountId: wire.accountId,
    amountCents: dollarsToCents(wire.amount),
    settlementCurrency: FINANCE_SETTLEMENT_CURRENCY,
    foreignAmountMinor: wire.foreignAmountMinor ?? null,
    foreignCurrency: wire.foreignCurrency ?? null,
    date: wire.date,
    type: wire.type,
    entityId: wire.entityId,
    entityName: wire.entityName,
  };
}
