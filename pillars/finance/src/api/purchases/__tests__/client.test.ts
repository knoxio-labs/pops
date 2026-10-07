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
  RECEIPT_EXTRACT_TIMEOUT_MS,
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
      extract: proc(answer('extract')),
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

  describe('extract', () => {
    const DRAFT = {
      kind: 'draft',
      receiptUris: [URI],
      reconciled: true,
      failures: [],
      matchedMerchantEntityId: 'entity-1',
      draft: {
        orderedAt: '2026-03-01T22:30:00Z',
        orderedAtOffsetMinutes: 660,
        currency: 'AUD',
        totalCents: 4250,
        merchantEntityName: 'Woolworths',
        items: [{ name: 'Milk', lineTotalCents: 4250 }],
        taxCents: 386,
      },
    };

    it('keeps the fields an entry is suggested from and drops the rest of the draft', async () => {
      const extract = vi.fn(async () => ok(DRAFT));
      const client = createPurchasesReceiptsClient(() => stubHandle({ extract }));

      await expect(client.extract([PART])).resolves.toEqual({
        kind: 'draft',
        receiptUris: [URI],
        draft: {
          orderedAt: '2026-03-01T22:30:00Z',
          orderedAtOffsetMinutes: 660,
          currency: 'AUD',
          totalCents: 4250,
          merchantEntityName: 'Woolworths',
        },
      });
      expect(extract).toHaveBeenCalledWith({ parts: [PART] });
    });

    it('answers an unreadable receipt with its stored files and no reason', async () => {
      const client = createPurchasesReceiptsClient(() =>
        stubHandle({
          extract: answering(ok({ kind: 'unreadable', receiptUris: [URI], reason: 'blurred' })),
        })
      );

      await expect(client.extract([PART])).resolves.toEqual({
        kind: 'unreadable',
        receiptUris: [URI],
      });
    });

    it('answers a 409 as already-a-purchase and carries nothing the producer said about it', async () => {
      const client = createPurchasesReceiptsClient(() =>
        stubHandle({
          extract: answering({
            kind: 'conflict',
            pillar: 'purchases',
            code: 'purchases.receipt.already_imported',
            message: 'This upload has already been read as purchase prc_secret.',
            details: { purchaseId: 'prc_secret' },
          }),
        })
      );

      const answer = await client.extract([PART]);

      expect(answer).toEqual({ kind: 'already-a-purchase' });
      expect(JSON.stringify(answer)).not.toContain('prc_secret');
    });

    it.each<[string, CallResult<unknown>]>([
      ['no vision model (503)', { kind: 'unavailable', pillar: 'purchases', code: 'x' }],
      ['an outage or a timeout', { kind: 'unavailable', pillar: 'purchases' }],
      ['a draft with no total', ok({ ...DRAFT, draft: { ...DRAFT.draft, totalCents: undefined } })],
      ['a date that is not one', ok({ ...DRAFT, draft: { ...DRAFT.draft, orderedAt: 'soon' } })],
      ['a draft with no files', ok({ ...DRAFT, receiptUris: [] })],
    ])('reports %s as unavailable', async (_what, result) => {
      const client = createPurchasesReceiptsClient(() =>
        stubHandle({ extract: answering(result) })
      );

      await expect(client.extract([PART])).rejects.toBeInstanceOf(PurchasesUnavailableError);
    });

    it('reports a file purchases will not take as rejected, with its message', async () => {
      const client = createPurchasesReceiptsClient(() =>
        stubHandle({
          extract: answering({ kind: 'bad-request', pillar: 'purchases', message: 'not a JPEG' }),
        })
      );

      await expect(client.extract([PART])).rejects.toThrow('not a JPEG');
      await expect(client.extract([PART])).rejects.toBeInstanceOf(ReceiptRejectedError);
    });

    it('gives the reading its own time budget and leaves every other call on the default', async () => {
      const budgets: (number | undefined)[] = [];
      const client = createPurchasesReceiptsClient((callTimeoutMs) => {
        budgets.push(callTimeoutMs);
        return stubHandle({
          extract: answering(ok(DRAFT)),
          store: answering(ok({ receiptUris: [URI] })),
        });
      });

      await client.extract([PART]);
      await client.store([PART]);

      expect(budgets).toEqual([RECEIPT_EXTRACT_TIMEOUT_MS, undefined]);
    });
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
