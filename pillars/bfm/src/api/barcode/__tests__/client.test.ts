import { afterEach, describe, expect, it, vi } from 'vitest';

import { fakePillarHandle } from '@pops/pillar-sdk/testing';

import { MobileBarcodeLookupOutcomeSchema } from '../../../contract/rest-mobile-barcode.js';
import { createPillarGateway } from '../../pillars/gateway.js';
import { createMobileBarcodeClient, BARCODE_LOOKUP_TIMEOUT_MS } from '../client.js';
import { BARCODE_PRODUCT } from './fixture.js';

import type { CallResult } from '@pops/pillar-sdk/server';

import type { PillarHandleFactory } from '../../pillars/gateway.js';

afterEach(() => {
  vi.useRealTimers();
});

function barcodeFactory(result: CallResult<unknown>, calls: unknown[] = []): PillarHandleFactory {
  return <TRouter>() =>
    fakePillarHandle<TRouter>('barcode', {
      lookup: {
        get: (input: unknown) => {
          calls.push(input);
          return Promise.resolve(result);
        },
      },
    });
}

describe('MobileBarcodeClient.lookup', () => {
  it('calls the barcode lookup leaf with the code and passes through a found outcome', async () => {
    const calls: unknown[] = [];
    const client = createMobileBarcodeClient(
      createPillarGateway(
        barcodeFactory(
          {
            kind: 'ok',
            value: { outcome: 'found', product: BARCODE_PRODUCT },
          },
          calls
        )
      )
    );

    const outcome = await client.lookup('9780330423304');

    expect(calls).toEqual([{ code: '9780330423304' }]);
    expect(outcome).toEqual({ kind: 'ok', value: { outcome: 'found', product: BARCODE_PRODUCT } });
  });

  it('passes through a not-found outcome', async () => {
    const client = createMobileBarcodeClient(
      createPillarGateway(barcodeFactory({ kind: 'ok', value: { outcome: 'not_found' } }))
    );

    await expect(client.lookup('9780330423304')).resolves.toEqual({
      kind: 'ok',
      value: { outcome: 'not_found' },
    });
  });

  it('turns a malformed producer body into a contract mismatch', async () => {
    const client = createMobileBarcodeClient(
      createPillarGateway(
        barcodeFactory({
          kind: 'ok',
          value: { outcome: 'found', product: { ...BARCODE_PRODUCT, title: 7 } },
        })
      )
    );

    const outcome = await client.lookup('9780330423304');

    expect(outcome.kind).toBe('contract-mismatch');
  });

  it('keeps the barcode contract schema aligned with the fixture', () => {
    expect(
      MobileBarcodeLookupOutcomeSchema.safeParse({
        outcome: 'found',
        product: BARCODE_PRODUCT,
      }).success
    ).toBe(true);
  });

  it('returns unavailable after the ten-second outer deadline', async () => {
    vi.useFakeTimers();
    const pending: Promise<CallResult<unknown>> = new Promise(() => undefined);
    const client = createMobileBarcodeClient(
      createPillarGateway(barcodeFactoryFromPromise(pending))
    );
    let settled = false;
    const outcome = client.lookup('9780330423304').then((value) => {
      settled = true;
      return value;
    });

    await vi.advanceTimersByTimeAsync(BARCODE_LOOKUP_TIMEOUT_MS - 1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);

    await expect(outcome).resolves.toEqual({
      kind: 'unavailable',
      pillar: 'barcode',
      status: 503,
    });
  });

  it('clears the deadline timer when the barcode call wins', async () => {
    vi.useFakeTimers();
    const client = createMobileBarcodeClient(
      createPillarGateway(barcodeFactory({ kind: 'ok', value: { outcome: 'not_found' } }))
    );

    await expect(client.lookup('9780330423304')).resolves.toEqual({
      kind: 'ok',
      value: { outcome: 'not_found' },
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});

function barcodeFactoryFromPromise(promise: Promise<CallResult<unknown>>): PillarHandleFactory {
  return <TRouter>() =>
    fakePillarHandle<TRouter>('barcode', {
      lookup: { get: () => promise },
    });
}
