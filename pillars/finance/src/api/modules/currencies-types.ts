/**
 * Wire mapper for the currencies domain (POPS-2802). The zod schemas live in
 * the REST contract (`src/contract/rest-currencies.ts`); this file keeps
 * only the row → response projection and its TS shape.
 */
import type { CurrencyKind } from '../../contract/currency-kind.js';
import type { CreateCurrencyInput, CurrencyRow, UpdateCurrencyInput } from '../../db/index.js';

/** API response shape (camelCase). */
export interface Currency {
  code: string;
  name: string;
  symbol: string | null;
  decimals: number;
  kind: CurrencyKind;
  createdAt: string;
}

/** Wire body accepted by `POST /currencies`. */
export interface CreateCurrencyBody {
  code: string;
  name: string;
  symbol?: string | null;
  decimals: number;
  kind: CurrencyKind;
}

/** Wire body accepted by `PATCH /currencies/:code`. */
export interface UpdateCurrencyBody {
  name?: string;
  symbol?: string | null;
  decimals?: number;
  kind?: CurrencyKind;
}

/** Map a SQLite row to the API response shape. */
export function toCurrency(row: CurrencyRow): Currency {
  return {
    code: row.code,
    name: row.name,
    symbol: row.symbol,
    decimals: row.decimals,
    kind: row.kind,
    createdAt: row.createdAt,
  };
}

/** Map a create request body to the persistence layer's input shape. */
export function toCreateCurrencyInput(body: CreateCurrencyBody): CreateCurrencyInput {
  return {
    code: body.code,
    name: body.name,
    symbol: body.symbol ?? null,
    decimals: body.decimals,
    kind: body.kind,
  };
}

/** Map an update request body to the persistence layer's input shape. */
export function toUpdateCurrencyInput(body: UpdateCurrencyBody): UpdateCurrencyInput {
  return {
    name: body.name,
    symbol: body.symbol,
    decimals: body.decimals,
    kind: body.kind,
  };
}
