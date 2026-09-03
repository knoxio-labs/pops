/**
 * Handlers for the `giftCardDetails.*` sub-router. `translateGiftCardError`
 * maps db domain errors to shared `HttpError` subclasses so `runHttp` yields
 * 404 / 422; `GiftCardEncryptionKeyMissingError` is deliberately left
 * unmapped so it surfaces as a 500 through Express's normal error pipeline —
 * a missing encryption key is a server misconfiguration, not a client error.
 *
 * The encryption key is resolved fresh on every request
 * (`resolveGiftCardEncryptionKey`) rather than once at startup, so a key
 * mounted/rotated after the process starts is picked up without a restart —
 * matching how `resolveServiceAccountKey` is called per-request elsewhere in
 * this pillar.
 */
import {
  AccountKindMismatchError,
  AccountNotFoundError,
  GiftCardDetailsNotFoundError,
  giftCardDetailsService,
  type FinanceDb,
} from '../../db/index.js';
import { resolveGiftCardEncryptionKey } from '../gift-card-encryption-key.js';
import { toGiftCardDetails, toRevealedGiftCardSecret } from '../modules/gift-card-details-types.js';
import { NotFoundError, UnprocessableEntityError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { financeGiftCardDetailsContract } from '../../contract/rest-gift-card-details.js';

type Req = ServerInferRequest<typeof financeGiftCardDetailsContract>;

function translateGiftCardError(err: unknown, id: string): never {
  if (err instanceof AccountNotFoundError) throw new NotFoundError('Account', id);
  if (err instanceof AccountKindMismatchError) throw new UnprocessableEntityError(err.message);
  if (err instanceof GiftCardDetailsNotFoundError) {
    throw new NotFoundError('Gift card details', id);
  }
  throw err;
}

export function makeGiftCardDetailsHandlers(db: FinanceDb) {
  return {
    get: ({ params }: Req['get']) =>
      runHttp(() => {
        try {
          const row = giftCardDetailsService.getGiftCardDetails(db, params.id);
          return { status: 200 as const, body: { data: toGiftCardDetails(row) } };
        } catch (err) {
          translateGiftCardError(err, params.id);
        }
      }),

    write: ({ params, body }: Req['write']) =>
      runHttp(() => {
        try {
          const row = giftCardDetailsService.writeGiftCardDetails(
            db,
            params.id,
            resolveGiftCardEncryptionKey(),
            {
              number: body.number,
              pin: body.pin,
              expiresOn: body.expiresOn ?? null,
              issuerEntityId: body.issuerEntityId ?? null,
            }
          );
          return {
            status: 200 as const,
            body: { data: toGiftCardDetails(row), message: 'Gift card details saved' },
          };
        } catch (err) {
          translateGiftCardError(err, params.id);
        }
      }),

    reveal: ({ params }: Req['reveal']) =>
      runHttp(() => {
        try {
          const secret = giftCardDetailsService.revealGiftCardSecret(
            db,
            params.id,
            resolveGiftCardEncryptionKey()
          );
          return {
            status: 200 as const,
            body: {
              data: toRevealedGiftCardSecret(secret),
              message: 'Gift card secret revealed',
            },
          };
        } catch (err) {
          translateGiftCardError(err, params.id);
        }
      }),
  };
}
