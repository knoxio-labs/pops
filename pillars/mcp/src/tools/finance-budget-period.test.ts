/**
 * Pins `finance.budgets.list`'s advertised `period` filter vocabulary
 * against the finance pillar's REAL enforcement.
 *
 * `BUDGET_PERIODS` in `finance-client.ts` is a hand-maintained mirror of the
 * `BudgetPeriodBody` zod enum in `pillars/finance/src/contract/rest-budgets.ts`
 * — the mcp pillar cannot import that contract module directly (mcp has no
 * compile-time dependency on the finance pillar, and adding one would drag
 * finance's whole runtime dependency set, including its native sqlite
 * binding, into the mcp image).
 *
 * `GET /budgets`'s own `period` query parameter is a loose
 * `z.string().optional()` server-side — not a closed enum — so there is
 * nothing to read back for the list endpoint itself. `POST /budgets` (and
 * `PATCH /budgets/:id`) DO enforce the vocabulary as a closed enum via
 * `BudgetPeriodBody`, and the finance pillar's committed OpenAPI spec is a
 * mechanical projection of that same contract
 * (`pnpm --filter @pops/finance generate:openapi`), so reading the create
 * body's `period` enum back here is a check against real enforcement, not a
 * second hand-typed copy.
 *
 * If this test fails, `BUDGET_PERIODS` in `finance-client.ts` no longer
 * matches what `POST /budgets` actually enforces — update it to match.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { BUDGET_PERIODS } from './finance-client.js';
import { financeTools } from './finance.js';

const here = dirname(fileURLToPath(import.meta.url));
const FINANCE_OPENAPI_PATH = join(here, '../../../finance/openapi/finance.openapi.json');

function prop(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`expected an object while reading "${key}", got ${typeof value}`);
  }
  return (value as Record<string, unknown>)[key];
}

function readEnforcedBudgetPeriods(): string[] {
  const spec: unknown = JSON.parse(readFileSync(FINANCE_OPENAPI_PATH, 'utf8'));
  const requestBody = prop(prop(prop(spec, 'paths'), '/budgets'), 'post');
  const schema = prop(prop(prop(requestBody, 'requestBody'), 'content'), 'application/json');
  const periodSchema = prop(prop(schema, 'schema'), 'properties');
  const period = prop(periodSchema, 'period');
  const enumValues = prop(period, 'enum');
  if (!Array.isArray(enumValues)) {
    throw new Error(
      `expected POST /budgets period to declare an enum, got ${JSON.stringify(period)}`
    );
  }
  return enumValues.filter((v): v is string => typeof v === 'string');
}

describe('finance.budgets.list period vocabulary', () => {
  const enforced = readEnforcedBudgetPeriods();

  it('BUDGET_PERIODS matches what POST /budgets actually enforces', () => {
    expect([...BUDGET_PERIODS]).toEqual(enforced);
  });

  it('the advertised tool schema enum matches BUDGET_PERIODS', () => {
    const tool = financeTools.find((t) => t.name === 'finance.budgets.list')!;
    const properties = tool.inputSchema.properties as
      | Record<string, { enum?: readonly string[] }>
      | undefined;
    expect(properties?.['period']?.enum).toEqual([...BUDGET_PERIODS]);
  });
});
