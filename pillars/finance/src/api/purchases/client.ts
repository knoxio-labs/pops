/**
 * Finance's authenticated client for the purchases receipt store (POPS-5870).
 *
 * A file attached to a transaction lives in that store; finance keeps the
 * `pops://purchases/receipt/<sha256>` URI and a reference that stops the
 * store's retention sweep deleting the file.
 *
 * Every method throws one of four errors, so a handler maps a failure without
 * knowing the SDK's vocabulary:
 *
 * - {@link PurchasesUnavailableError}: nothing usable came back. Purchases is
 *   down, this process holds no service-account key, or the key was refused.
 *   The last two are logged apart from an outage, because they do not clear on
 *   a retry.
 * - {@link ReceiptNotFoundError}: the store holds no file under that hash.
 * - {@link ReceiptRejectedError}: purchases refused the input as invalid.
 * - {@link ReceiptNotAPictureError}: a thumbnail was asked of a file that is
 *   not an image.
 */
import { isOk, pillar, type CallResult, type PillarHandle } from '@pops/pillar-sdk/server';

import {
  StoredReceiptBytesSchema,
  StoredReceiptUrisSchema,
  type ReceiptPart,
  type StoredReceiptBytes,
} from '../../contract/rest-transaction-attachments-schemas.js';
import {
  credentialled,
  credentialRejectedMessage,
  NO_CREDENTIAL_REASON,
  UNAUTHORIZED_REASON,
} from '../pillars/outbound.js';

import type { z } from 'zod';

export const PURCHASES_PILLAR_ID = 'purchases';

const UNSUPPORTED_MEDIA_TYPE = 415;

/**
 * The subset of the purchases router finance calls. A `type`, and declared
 * beside the `pillar()` call, because the cross-pillar-expectations guard
 * resolves a call site's operations from this declaration in the same file.
 */
export type PurchasesRouter = {
  receipt: {
    store: (input: { parts: ReceiptPart[] }) => Promise<unknown>;
    addReferences: (input: { ownerUri: string; receiptUris: string[] }) => Promise<unknown>;
    removeReferences: (input: { ownerUri: string; receiptUris?: string[] }) => Promise<unknown>;
    read: (input: { sha256: string }) => Promise<unknown>;
    thumbnail: (input: { sha256: string }) => Promise<unknown>;
  };
};

/** Purchases gave no usable answer. `detail` says why, for the log and the response. */
export class PurchasesUnavailableError extends Error {
  constructor(
    public readonly detail: string,
    public readonly operation: string
  ) {
    super(`purchases ${operation} failed: ${detail}`);
    this.name = 'PurchasesUnavailableError';
  }
}

/** The receipt store holds no file under the hash asked for. */
export class ReceiptNotFoundError extends Error {
  constructor(public readonly operation: string) {
    super(`purchases ${operation}: no such receipt file`);
    this.name = 'ReceiptNotFoundError';
  }
}

/** Purchases refused the input: a file that is not the type it claims, or a malformed URI. */
export class ReceiptRejectedError extends Error {
  constructor(
    message: string | undefined,
    public readonly operation: string
  ) {
    super(message ?? 'The receipt store refused the file');
    this.name = 'ReceiptRejectedError';
  }
}

/** The file exists and has no thumbnail: a PDF, a text body, or an undecodable image. */
export class ReceiptNotAPictureError extends Error {
  constructor(message: string | undefined) {
    super(message ?? 'This file has no thumbnail');
    this.name = 'ReceiptNotAPictureError';
  }
}

export interface PurchasesReceiptsClient {
  /** Store files without reading them. Returns one URI per part, in order. */
  store(parts: ReceiptPart[]): Promise<string[]>;
  /** Pin stored files for an owner so the retention sweep keeps them. Idempotent. */
  addReferences(ownerUri: string, receiptUris: string[]): Promise<void>;
  /** Release an owner's pins on the named files, or on all of them when none are named. */
  removeReferences(ownerUri: string, receiptUris?: string[]): Promise<void>;
  read(sha256: string): Promise<StoredReceiptBytes>;
  thumbnail(sha256: string): Promise<StoredReceiptBytes>;
}

function failure(result: Exclude<CallResult<unknown>, { kind: 'ok' }>, operation: string): Error {
  switch (result.kind) {
    case 'not-found':
      return new ReceiptNotFoundError(operation);
    case 'bad-request':
      return new ReceiptRejectedError(result.message, operation);
    case 'unauthorized':
      console.error(credentialRejectedMessage(PURCHASES_PILLAR_ID, operation));
      return new PurchasesUnavailableError(UNAUTHORIZED_REASON, operation);
    case 'refused':
      return result.status === UNSUPPORTED_MEDIA_TYPE
        ? new ReceiptNotAPictureError(result.message)
        : new PurchasesUnavailableError(`refused (${result.status})`, operation);
    default:
      return new PurchasesUnavailableError(result.kind, operation);
  }
}

/**
 * Build the default purchases receipt client. `handleFactory` is injectable so
 * unit tests can supply a stub router; production builds the credentialled
 * handle per call, so a missing service-account key fails the one request
 * that needed purchases instead of stopping finance from booting.
 */
export function createPurchasesReceiptsClient(
  handleFactory: () => PillarHandle<PurchasesRouter> | null = () =>
    credentialled(PURCHASES_PILLAR_ID, () => pillar<PurchasesRouter>('purchases'))
): PurchasesReceiptsClient {
  async function call(
    operation: string,
    invoke: (handle: PillarHandle<PurchasesRouter>) => Promise<CallResult<unknown>>
  ): Promise<unknown> {
    const handle = handleFactory();
    if (handle === null) throw new PurchasesUnavailableError(NO_CREDENTIAL_REASON, operation);
    const result = await invoke(handle);
    if (!isOk(result)) throw failure(result, operation);
    return result.value;
  }

  function parsed<TSchema extends z.ZodType>(
    schema: TSchema,
    value: unknown,
    operation: string
  ): z.infer<TSchema> {
    const outcome = schema.safeParse(value);
    if (!outcome.success) throw new PurchasesUnavailableError('malformed response', operation);
    return outcome.data;
  }

  return {
    async store(parts): Promise<string[]> {
      const operation = 'receipt.store';
      const value = await call(operation, (handle) => handle.receipt.store({ parts }));
      const { receiptUris } = parsed(StoredReceiptUrisSchema, value, operation);
      if (receiptUris.length !== parts.length) {
        throw new PurchasesUnavailableError('malformed response', operation);
      }
      return receiptUris;
    },

    async addReferences(ownerUri, receiptUris): Promise<void> {
      await call('receipt.addReferences', (handle) =>
        handle.receipt.addReferences({ ownerUri, receiptUris })
      );
    },

    async removeReferences(ownerUri, receiptUris): Promise<void> {
      await call('receipt.removeReferences', (handle) =>
        handle.receipt.removeReferences(
          receiptUris === undefined ? { ownerUri } : { ownerUri, receiptUris }
        )
      );
    },

    async read(sha256): Promise<StoredReceiptBytes> {
      const operation = 'receipt.read';
      const value = await call(operation, (handle) => handle.receipt.read({ sha256 }));
      return parsed(StoredReceiptBytesSchema, value, operation);
    },

    async thumbnail(sha256): Promise<StoredReceiptBytes> {
      const operation = 'receipt.thumbnail';
      const value = await call(operation, (handle) => handle.receipt.thumbnail({ sha256 }));
      return parsed(StoredReceiptBytesSchema, value, operation);
    },
  };
}
