/**
 * Pins `finance.transactions.list`'s advertised `type` filter vocabulary
 * against the finance pillar's REAL enforcement.
 *
 * `TRANSACTION_TYPES` in `finance-client.ts` is a hand-maintained mirror of
 * the same-named constant in
 * `pillars/finance/src/contract/corrections-constants.ts` — the mcp pillar
 * cannot import that contract module directly (mcp has no compile-time
 * dependency on the finance pillar, and adding one would drag finance's
 * whole runtime dependency set, including its native sqlite binding, into
 * the mcp image). The finance pillar's committed OpenAPI spec is a
 * mechanical projection of that same contract
 * (`pnpm --filter @pops/finance generate:openapi`), so reading it back here
 * is a check against the real enforcement, not a second hand-typed copy.
 *
 * If this test fails, `TRANSACTION_TYPES` in `finance-client.ts` no longer
 * matches what `GET /transactions` actually enforces — update it to match.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { TRANSACTION_TYPES } from './finance-client.js';
import { financeTools } from './finance.js';

const here = dirname(fileURLToPath(import.meta.url));
const FINANCE_OPENAPI_PATH = join(here, '../../../finance/openapi/finance.openapi.json');

function prop(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`expected an object while reading "${key}", got ${typeof value}`);
  }
  return (value as Record<string, unknown>)[key];
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((v): v is string => typeof v === 'string')) {
    throw new Error(`expected ${label} to be a string array, got ${JSON.stringify(value)}`);
  }
  return value;
}

function readEnforcedTransactionTypes(): string[] {
  const spec: unknown = JSON.parse(readFileSync(FINANCE_OPENAPI_PATH, 'utf8'));
  const parameters = prop(prop(prop(spec, 'paths'), '/transactions'), 'get');
  const params = prop(parameters, 'parameters');
  if (!Array.isArray(params)) {
    throw new Error('expected /transactions get parameters to be an array');
  }
  const typeParam = params.find(
    (p): p is Record<string, unknown> =>
      typeof p === 'object' && p !== null && (p as Record<string, unknown>)['name'] === 'type'
  );
  if (!typeParam) {
    throw new Error('expected a "type" query parameter on GET /transactions');
  }
  return stringArray(prop(prop(typeParam, 'schema'), 'enum'), 'type enum');
}

describe('finance.transactions.list type vocabulary', () => {
  const enforced = readEnforcedTransactionTypes();

  it('does not include "expense", which is not a real transaction type', () => {
    expect(enforced).not.toContain('expense');
    expect(TRANSACTION_TYPES).not.toContain('expense');
  });

  it('TRANSACTION_TYPES matches what GET /transactions actually enforces', () => {
    expect([...TRANSACTION_TYPES]).toEqual(enforced);
  });

  it('the advertised tool schema enum matches TRANSACTION_TYPES', () => {
    const tool = financeTools.find((t) => t.name === 'finance.transactions.list')!;
    const properties = tool.inputSchema.properties as
      | Record<string, { enum?: readonly string[] }>
      | undefined;
    expect(properties?.['type']?.enum).toEqual([...TRANSACTION_TYPES]);
  });
});
