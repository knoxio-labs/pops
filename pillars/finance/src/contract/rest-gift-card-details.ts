/**
 * `accounts/:id/gift-card-details.*` sub-router — recoverable encrypted
 * number/PIN storage for `gift-card`-kind accounts (POPS-2772).
 *
 * `get` and `write` never carry the plaintext number/PIN on the wire — only
 * `lastFour`, `expiresOn` and `issuerEntityId`. `reveal` is the one route
 * that decrypts and returns the plaintext, and does so once per call rather
 * than caching it anywhere; every call is recorded in the
 * `gift_card_secret_reveals` audit table.
 *
 * Every route here 422s if the targeted account exists but is not
 * `kind: 'gift-card'` (`AccountKindMismatchError`) — see
 * `ERR_RESPONSES_WITH_422`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES_WITH_422 } from './rest-schemas.js';

const c = initContract();

/** Masked wire shape — never the plaintext number/PIN. */
export const GiftCardDetailsSchema = z.object({
  accountId: z.string(),
  lastFour: z.string(),
  expiresOn: z.string().nullable(),
  issuerEntityId: z.string().nullable(),
});

const WriteGiftCardDetailsBody = z.object({
  number: z.string().min(1, 'Card number is required'),
  pin: z.string().min(1, 'PIN is required'),
  expiresOn: z.string().nullable().optional(),
  issuerEntityId: z.string().nullable().optional(),
});

const GiftCardDetailsMutation = z.object({ data: GiftCardDetailsSchema, message: z.string() });

/** The plaintext {@link WriteGiftCardDetailsBody} secret fields, revealed once. */
export const RevealedGiftCardSecretSchema = z.object({
  number: z.string(),
  pin: z.string(),
});

const RevealGiftCardSecretResponse = z.object({
  data: RevealedGiftCardSecretSchema,
  message: z.string(),
});

export const financeGiftCardDetailsContract = c.router({
  get: {
    method: 'GET',
    path: '/accounts/:id/gift-card-details',
    pathParams: z.object({ id: z.string() }),
    responses: { 200: z.object({ data: GiftCardDetailsSchema }), ...ERR_RESPONSES_WITH_422 },
    summary: 'Masked read of a gift card account’s details — never the number/PIN',
  },
  write: {
    method: 'PUT',
    path: '/accounts/:id/gift-card-details',
    pathParams: z.object({ id: z.string() }),
    body: WriteGiftCardDetailsBody,
    responses: { 200: GiftCardDetailsMutation, ...ERR_RESPONSES_WITH_422 },
    summary: 'Create or replace a gift card account’s encrypted number/PIN',
  },
  reveal: {
    method: 'POST',
    path: '/accounts/:id/gift-card-details/reveal',
    pathParams: z.object({ id: z.string() }),
    body: z.object({}).optional(),
    responses: { 200: RevealGiftCardSecretResponse, ...ERR_RESPONSES_WITH_422 },
    summary: 'Decrypt and return the plaintext number/PIN once; audited',
  },
});
