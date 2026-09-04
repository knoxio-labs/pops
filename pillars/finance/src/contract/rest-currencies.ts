/**
 * `currencies.*` sub-router — currency list/create/delete (POPS-2802).
 *
 * `accounts.currency` will foreign-key onto this table once POPS-2767 lands;
 * until then this is a standalone growable list a client can read and add
 * to (e.g. registering a new rewards-points program).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { CURRENCY_KINDS } from './currency-kind.js';
import { ERR_RESPONSES, MessageSchema } from './rest-schemas.js';

const c = initContract();

/** Wire shape served by the currencies handlers. */
export const CurrencySchema = z.object({
  code: z.string(),
  name: z.string(),
  symbol: z.string().nullable(),
  decimals: z.number().int().nonnegative(),
  kind: z.enum(CURRENCY_KINDS),
  createdAt: z.string(),
});

const CreateCurrencyBody = z.object({
  code: z.string().min(1, 'Code is required'),
  name: z.string().min(1, 'Name is required'),
  symbol: z.string().nullable().optional(),
  decimals: z.number().int().nonnegative('Decimals must not be negative'),
  kind: z.enum(CURRENCY_KINDS),
});

const UpdateCurrencyBody = z.object({
  name: z.string().min(1, 'Name cannot be empty').optional(),
  symbol: z.string().nullable().optional(),
  decimals: z.number().int().nonnegative('Decimals must not be negative').optional(),
  kind: z.enum(CURRENCY_KINDS).optional(),
});

const CurrencyMutation = z.object({ data: CurrencySchema, message: z.string() });

export const financeCurrenciesContract = c.router({
  list: {
    method: 'GET',
    path: '/currencies',
    responses: { 200: z.object({ data: z.array(CurrencySchema) }) },
    summary: 'List every currency, fiat and points alike',
  },
  create: {
    method: 'POST',
    path: '/currencies',
    body: CreateCurrencyBody,
    responses: { 201: CurrencyMutation, ...ERR_RESPONSES },
    summary: 'Register a new currency (or points program)',
  },
  update: {
    method: 'PATCH',
    path: '/currencies/:code',
    pathParams: z.object({ code: z.string() }),
    body: UpdateCurrencyBody,
    responses: { 200: CurrencyMutation, ...ERR_RESPONSES },
    summary:
      'Edit a currency; changing decimals is refused with 409 while any account references it',
  },
  delete: {
    method: 'DELETE',
    path: '/currencies/:code',
    pathParams: z.object({ code: z.string() }),
    body: z.object({}).optional(),
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Delete a currency, refused while any table still references it',
  },
});
