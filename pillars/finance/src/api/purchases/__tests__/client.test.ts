import { describe, expect, it, vi } from 'vitest';

import {
  type CallDynamicFn,
  type CallResult,
  type CallableProcedure,
  type PillarHandle,
} from '@pops/pillar-sdk/client';

import {
  createPurchasesReceiptsClient,
  type PurchasesRouter,
  PurchasesUnavailableError,
  ReceiptNotAPictureError,
  ReceiptNotFoundError,
  ReceiptRejectedError,
} from '../client.js';

const SHA = 'a'.repeat(64);
const URI = `pops://purchases/receipt/${SHA}`;
const PART = { mediaType: 'image/jpeg', dataBase64: 'aGVsbG8=' };
const BYTES = { sha256: SHA, mediaType: 'image/jpeg', byteLength: 5, dataBase64: 'aGVsbG8=' };

type Operation = keyof PurchasesRouter['receipt'];
type Answer = (input: unknown) => Promise<CallResult<unknown>>;

function proc<Args extends readonly unknown[], Output>(
  fn: (...args: Args) => Promise<CallResult<Output>>
): CallableProcedure<Args, Output> {
  const orThrow = async (...args: Args): Promise<Output> => {
    const result = await fn(...args);
    if (result.kind !== 'ok') throw new Error(`stub orThrow: ${result.kind}`);
    return result.value;
  };
  return Object.assign(fn, { orThrow });
}

const callDynamic: CallDynamicFn = () => {
  throw new Error('callDynamic is not used by the purchases client');
};

function stubHandle(impls: Partial<Record<Operation, Answer>>): PillarHandle<PurchasesRouter> {
  const answer = (operation: Operation): Answer =>
    impls[operation] ??
    (() => {
      throw new Error(`stub receipt.${operation} called unexpectedly`);
    });
  return {
    receipt: {
      store: proc(answer('store')),
      addReferences: proc(answer('addReferences')),
      removeReferences: proc(answer('removeReferences')),
      read: proc(answer('read')),
      thumbnail: proc(answer('thumbnail')),
    },
    callDynamic,
  };
}

const answering = (result: CallResult<unknown>): Answer => vi.fn(async () => result);
const ok = (value: unknown): CallResult<unknown> => ({ kind: 'ok', value });

describe('createPurchasesReceiptsClient', () => {
  it('sends flat arguments and answers the stored URIs in order', async () => {
    const store = vi.fn(async () => ok({ receiptUris: [URI] }));
    const client = createPurchasesReceiptsClient(() => stubHandle({ store }));

    await expect(client.store([PART])).resolves.toEqual([URI]);
    expect(store).toHaveBeenCalledWith({ parts: [PART] });
  });

  it('treats a store answer with the wrong number of URIs as no answer', async () => {
    const client = createPurchasesReceiptsClient(() =>
      stubHandle({ store: answering(ok({ receiptUris: [URI] })) })
    );

    await expect(client.store([PART, PART])).rejects.toBeInstanceOf(PurchasesUnavailableError);
  });

  it('treats a malformed read answer as no answer', async () => {
    const client = createPurchasesReceiptsClient(() =>
      stubHandle({ read: answering(ok({ ...BYTES, byteLength: 0 })) })
    );

    await expect(client.read(SHA)).rejects.toBeInstanceOf(PurchasesUnavailableError);
  });

  it('names the owner alone to release every pin, and the files to release some', async () => {
    const removeReferences = vi.fn(async () => ok({ ok: true }));
    const client = createPurchasesReceiptsClient(() => stubHandle({ removeReferences }));

    await client.removeReferences('pops://finance/transaction/t1');
    await client.removeReferences('pops://finance/transaction/t1', [URI]);

    expect(removeReferences.mock.calls).toEqual([
      [{ ownerUri: 'pops://finance/transaction/t1' }],
      [{ ownerUri: 'pops://finance/transaction/t1', receiptUris: [URI] }],
    ]);
  });

  it('reports a missing service-account key as unavailable without calling out', async () => {
    const client = createPurchasesReceiptsClient(() => null);

    await expect(client.read(SHA)).rejects.toMatchObject({
      name: 'PurchasesUnavailableError',
      detail: 'no-credential',
    });
  });

  it('reports a refused credential as unavailable and logs it', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = createPurchasesReceiptsClient(() =>
      stubHandle({ read: answering({ kind: 'unauthorized', pillar: 'purchases' }) })
    );

    await expect(client.read(SHA)).rejects.toBeInstanceOf(PurchasesUnavailableError);
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });

  it.each<[string, CallResult<unknown>, new (...args: never[]) => Error]>([
    ['an outage', { kind: 'unavailable', pillar: 'purchases' }, PurchasesUnavailableError],
    ['a 404', { kind: 'not-found', pillar: 'purchases' }, ReceiptNotFoundError],
    [
      'a 415',
      { kind: 'refused', pillar: 'purchases', status: 415, message: 'not an image' },
      ReceiptNotAPictureError,
    ],
    [
      'any other refusal',
      { kind: 'refused', pillar: 'purchases', status: 422 },
      PurchasesUnavailableError,
    ],
  ])('maps %s on thumbnail to its own error', async (_what, result, expected) => {
    const client = createPurchasesReceiptsClient(() =>
      stubHandle({ thumbnail: answering(result) })
    );

    await expect(client.thumbnail(SHA)).rejects.toBeInstanceOf(expected);
  });

  it('carries the producer’s message on a rejected file', async () => {
    const client = createPurchasesReceiptsClient(() =>
      stubHandle({
        store: answering({ kind: 'bad-request', pillar: 'purchases', message: 'not a JPEG' }),
      })
    );

    const failure = client.store([PART]);

    await expect(failure).rejects.toBeInstanceOf(ReceiptRejectedError);
    await expect(failure).rejects.toThrow('not a JPEG');
  });
});
