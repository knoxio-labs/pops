/**
 * Finance's authenticated client for the purchases receipt store (POPS-5870).
 *
 * A file attached to a transaction lives in that store; finance keeps the
 * `pops://purchases/receipt/<sha256>` URI and a reference that stops the
 * store's retention sweep deleting the file.
 *
 * `extract` (POPS-5871) is the one call that asks the store to read a file as
 * well as keep it, and the one whose refusals are answers, not failures: see
 * {@link PurchasesReceiptsClient.extract}.
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
  ReceiptReadingSchema,
  StoredReceiptBytesSchema,
  StoredReceiptUrisSchema,
  type ReceiptPart,
  type ReceiptReading,
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
 * How long a receipt reading may take. A vision model reads for longer than
 * the budget every other outbound call in this process runs on, and still
 * well inside the 300s the shell's proxy gives a pillar API.
 */
export const RECEIPT_EXTRACT_TIMEOUT_MS = 90_000;

/**
 * The files had already been recorded as a household purchase. Carries nothing
 * about that purchase: it is not the caller's to see.
 */
export type ReceiptExtraction = ReceiptReading | { kind: 'already-a-purchase' };

/**
 * The subset of the purchases router finance calls. A `type`, and declared
 * beside the `pillar()` call, because the cross-pillar-expectations guard
 * resolves a call site's operations from this declaration in the same file.
 */
export type PurchasesRouter = {
  receipt: {
    store: (input: { parts: ReceiptPart[] }) => Promise<unknown>;
    extract: (input: { parts: ReceiptPart[] }) => Promise<unknown>;
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
  /**
   * Store files and read them as one receipt. Creates no purchase.
   *
   * Purchases refusing because the files already became a purchase is an
   * answer, `already-a-purchase`. Purchases having no reader, being down or
   * not answering in time is a {@link PurchasesUnavailableError}, after which
   * `store` may still succeed.
   */
  extract(parts: ReceiptPart[]): Promise<ReceiptExtraction>;
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

type Invoke = (handle: PillarHandle<PurchasesRouter>) => Promise<CallResult<unknown>>;

/** Builds the handle for one call, on its own time budget when one is given. Null without a key. */
type PurchasesHandleFactory = (callTimeoutMs?: number) => PillarHandle<PurchasesRouter> | null;

const credentialledHandle: PurchasesHandleFactory = (callTimeoutMs) =>
  credentialled(PURCHASES_PILLAR_ID, () =>
    pillar<PurchasesRouter>('purchases', callTimeoutMs === undefined ? {} : { callTimeoutMs })
  );

function parsed<TSchema extends z.ZodType>(
  schema: TSchema,
  value: unknown,
  operation: string
): z.infer<TSchema> {
  const outcome = schema.safeParse(value);
  if (!outcome.success) throw new PurchasesUnavailableError('malformed response', operation);
  return outcome.data;
}

interface Callers {
  answer(operation: string, invoke: Invoke, callTimeoutMs?: number): Promise<CallResult<unknown>>;
  call(operation: string, invoke: Invoke): Promise<unknown>;
}

function callers(handleFactory: PurchasesHandleFactory): Callers {
  /** What purchases answered, failures included, for a caller that reads some of them. */
  async function answer(
    operation: string,
    invoke: Invoke,
    callTimeoutMs?: number
  ): Promise<CallResult<unknown>> {
    const handle = handleFactory(callTimeoutMs);
    if (handle === null) throw new PurchasesUnavailableError(NO_CREDENTIAL_REASON, operation);
    return invoke(handle);
  }

  async function call(operation: string, invoke: Invoke): Promise<unknown> {
    const result = await answer(operation, invoke);
    if (!isOk(result)) throw failure(result, operation);
    return result.value;
  }

  return { answer, call };
}

/**
 * Build the default purchases receipt client. `handleFactory` is injectable so
 * unit tests can supply a stub router; production builds the credentialled
 * handle per call, so a missing service-account key fails the one request
 * that needed purchases instead of stopping finance from booting.
 */
export function createPurchasesReceiptsClient(
  handleFactory: PurchasesHandleFactory = credentialledHandle
): PurchasesReceiptsClient {
  const { answer, call } = callers(handleFactory);

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

    async extract(parts): Promise<ReceiptExtraction> {
      const operation = 'receipt.extract';
      const result = await answer(
        operation,
        (handle) => handle.receipt.extract({ parts }),
        RECEIPT_EXTRACT_TIMEOUT_MS
      );
      if (isOk(result)) return parsed(ReceiptReadingSchema, result.value, operation);
      if (result.kind === 'conflict') return { kind: 'already-a-purchase' };
      throw failure(result, operation);
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
