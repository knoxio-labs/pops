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
  account: z.string(),
  /** DECIMAL DOLLARS, not cents. Converted at the boundary; never propagated. */
  amount: z.number(),
  /** Date-only `YYYY-MM-DD`, not a timestamp. */
  date: z.string(),
  type: z.string(),
  entityId: z.string().nullable(),
  entityName: z.string().nullable(),
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
  readonly account: string;
  readonly amountCents: number;
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
    account: wire.account,
    amountCents: dollarsToCents(wire.amount),
    date: wire.date,
    type: wire.type,
    entityId: wire.entityId,
    entityName: wire.entityName,
  };
}
