/**
 * Pins `finance.search`'s advertised filter vocabulary against the finance
 * pillar's REAL enforcement.
 *
 * `SEARCH_FILTER_FIELDS` / `SEARCH_FILTER_OPERATORS` in `finance-client.ts`
 * are a hand-maintained mirror of the same-named constants in
 * `pillars/finance/src/contract/rest-search.ts` — the mcp pillar cannot
 * import that contract module directly (mcp has no compile-time dependency
 * on the finance pillar, and adding one would drag finance's whole runtime
 * dependency set, including its native sqlite binding, into the mcp image).
 * The finance pillar's committed OpenAPI spec is a mechanical projection of
 * that same contract (`pnpm --filter @pops/finance generate:openapi`), so
 * reading it back here is a check against the real enforcement, not a
 * second hand-typed copy.
 *
 * If this test fails, `finance-client.ts`'s constants no longer match what
 * `POST /search` actually enforces — update them to match.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SEARCH_FILTER_FIELDS, SEARCH_FILTER_OPERATORS } from './finance-client.js';
import { financeSearch } from './finance-search.js';

const here = dirname(fileURLToPath(import.meta.url));
const FINANCE_OPENAPI_PATH = join(here, '../../../finance/openapi/finance.openapi.json');

function prop(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`expected an object while reading "${key}", got ${typeof value}`);
  }
  return (value as Record<string, unknown>)[key];
}

function drill(value: unknown, ...keys: string[]): unknown {
  return keys.reduce(prop, value);
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((v): v is string => typeof v === 'string')) {
    throw new Error(`expected ${label} to be a string array, got ${JSON.stringify(value)}`);
  }
  return value;
}

function readFinanceSearchFilterEnums(): { field: string[]; operator: string[] } {
  const spec: unknown = JSON.parse(readFileSync(FINANCE_OPENAPI_PATH, 'utf8'));
  const filterItemProps = drill(
    spec,
    'paths',
    '/search',
    'post',
    'requestBody',
    'content',
    'application/json',
    'schema',
    'properties',
    'query',
    'properties',
    'filters',
    'items',
    'properties'
  );
  return {
    field: stringArray(prop(prop(filterItemProps, 'field'), 'enum'), 'field enum'),
    operator: stringArray(prop(prop(filterItemProps, 'operator'), 'enum'), 'operator enum'),
  };
}

describe('finance.search filter vocabulary', () => {
  const enforced = readFinanceSearchFilterEnums();

  it('SEARCH_FILTER_FIELDS matches what POST /search actually enforces', () => {
    expect([...SEARCH_FILTER_FIELDS]).toEqual(enforced.field);
  });

  it('SEARCH_FILTER_OPERATORS matches what POST /search actually enforces', () => {
    expect([...SEARCH_FILTER_OPERATORS]).toEqual(enforced.operator);
  });

  it('the advertised tool schema enum matches SEARCH_FILTER_FIELDS', () => {
    const filters = financeSearch.inputSchema.properties?.['filters'];
    const field = drill(filters, 'items', 'properties', 'field', 'enum');
    expect(stringArray(field, 'schema field enum')).toEqual([...SEARCH_FILTER_FIELDS]);
  });

  it('the advertised tool schema enum matches SEARCH_FILTER_OPERATORS', () => {
    const filters = financeSearch.inputSchema.properties?.['filters'];
    const operator = drill(filters, 'items', 'properties', 'operator', 'enum');
    expect(stringArray(operator, 'schema operator enum')).toEqual([...SEARCH_FILTER_OPERATORS]);
  });
});
