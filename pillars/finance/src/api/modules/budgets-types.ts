/**
 * Wire mapper for the budgets domain. The zod schemas now live in the
 * REST contract (`src/contract/rest-budgets.ts`); this file keeps only
 * the row → response projection and its TS shape.
 *
 * All money crosses from the pillar's internal integer-cents representation
 * (#3665, CF041) to the decimal-dollar wire contract exactly here:
 * `toBudget` converts `amountCents`/`spentCents`/`remainingCents`, and
 * `toCreateBudgetInput`/`toUpdateBudgetInput` convert a request body's
 * dollar `amount` back to cents for the persistence layer.
 */
import { centsToDollars, centsToDollarsNullable, dollarsToCentsNullable } from '../../money.js';

import type { BudgetWithSpend, CreateBudgetInput, UpdateBudgetInput } from '../../db/index.js';

/** API response shape (camelCase). */
export interface Budget {
  id: string;
  category: string;
  period: string | null;
  amount: number | null;
  active: boolean;
  notes: string | null;
  lastEditedTime: string;
  /** Aggregated outflow over the budget's period (always >= 0). */
  spent: number;
  /** `amount - spent`, or `null` when the budget has no target amount. */
  remaining: number | null;
}

/** Wire body accepted by `POST /budgets` (dollars `amount`). */
export interface CreateBudgetBody {
  category: string;
  period?: string | null;
  amount?: number | null;
  active?: boolean;
  notes?: string | null;
}

/** Wire body accepted by `PATCH /budgets/:id` (dollars `amount`). */
export interface UpdateBudgetBody {
  category?: string;
  period?: string | null;
  amount?: number | null;
  active?: boolean;
  notes?: string | null;
}

/**
 * Map a SQLite row (enriched with spend aggregates) to the API response
 * shape. Converts `active` from INTEGER (0/1) to boolean.
 */
export function toBudget(row: BudgetWithSpend): Budget {
  return {
    id: row.id,
    category: row.category,
    period: row.period,
    amount: centsToDollarsNullable(row.amountCents),
    active: row.active === 1,
    notes: row.notes,
    lastEditedTime: row.lastEditedTime,
    spent: centsToDollars(row.spentCents),
    remaining: centsToDollarsNullable(row.remainingCents),
  };
}

/** Map a create request body to the persistence layer's input shape. */
export function toCreateBudgetInput(body: CreateBudgetBody): CreateBudgetInput {
  return {
    category: body.category,
    period: body.period,
    amountCents: dollarsToCentsNullable(body.amount),
    active: body.active,
    notes: body.notes,
  };
}

/** Map an update request body to the persistence layer's input shape. */
export function toUpdateBudgetInput(body: UpdateBudgetBody): UpdateBudgetInput {
  return {
    category: body.category,
    period: body.period,
    amountCents: body.amount === undefined ? undefined : dollarsToCentsNullable(body.amount),
    active: body.active,
    notes: body.notes,
  };
}
