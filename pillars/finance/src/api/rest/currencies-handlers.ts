/**
 * Handlers for the `currencies.*` sub-router. `translateCurrencyError` maps
 * db domain errors (`CurrencyNotFoundError`, `CurrencyConflictError`,
 * `CurrencyInUseError`) to shared `HttpError` subclasses so `runHttp` yields
 * 404 / 409.
 */
import {
  CurrencyConflictError,
  CurrencyDecimalsInUseError,
  CurrencyInUseError,
  CurrencyNotFoundError,
} from '../../db/errors.js';
import { currenciesService, type FinanceDb } from '../../db/index.js';
import {
  toCreateCurrencyInput,
  toCurrency,
  toUpdateCurrencyInput,
} from '../modules/currencies-types.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { financeCurrenciesContract } from '../../contract/rest-currencies.js';

type Req = ServerInferRequest<typeof financeCurrenciesContract>;

function translateCurrencyError(err: unknown, code?: string): never {
  if (err instanceof CurrencyNotFoundError) throw new NotFoundError('Currency', code ?? err.code);
  if (err instanceof CurrencyConflictError) throw new ConflictError(err.message);
  if (err instanceof CurrencyInUseError) throw new ConflictError(err.message);
  if (err instanceof CurrencyDecimalsInUseError) throw new ConflictError(err.message);
  throw err;
}

export function makeCurrenciesHandlers(db: FinanceDb) {
  return {
    list: () =>
      runHttp(() => {
        const rows = currenciesService.listCurrencies(db);
        return { status: 200 as const, body: { data: rows.map(toCurrency) } };
      }),

    create: ({ body }: Req['create']) =>
      runHttp(() => {
        try {
          const row = currenciesService.createCurrency(db, toCreateCurrencyInput(body));
          return {
            status: 201 as const,
            body: { data: toCurrency(row), message: 'Currency created' },
          };
        } catch (err) {
          translateCurrencyError(err);
        }
      }),

    update: ({ params, body }: Req['update']) =>
      runHttp(() => {
        try {
          const row = currenciesService.updateCurrency(
            db,
            params.code,
            toUpdateCurrencyInput(body)
          );
          return {
            status: 200 as const,
            body: { data: toCurrency(row), message: 'Currency updated' },
          };
        } catch (err) {
          translateCurrencyError(err, params.code);
        }
      }),

    delete: ({ params }: Req['delete']) =>
      runHttp(() => {
        try {
          currenciesService.deleteCurrency(db, params.code);
          return { status: 200 as const, body: { message: 'Currency deleted' } };
        } catch (err) {
          translateCurrencyError(err, params.code);
        }
      }),
  };
}
