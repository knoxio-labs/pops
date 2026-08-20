/**
 * A stand-in for the purchases pillar's receipt-BYTES surface, behind a real
 * {@link PillarGateway}.
 *
 * A fake HANDLE, like its two siblings in this directory: the gateway, the
 * wire validation and the error mapping are all production code under test,
 * and only the network is replaced.
 *
 * The recorded calls are the load-bearing half. Both routes are pass-throughs,
 * so a response assertion alone would pass just as happily against a bfm that
 * asked for the wrong hash, called the wrong producer route, or — the case
 * that matters — fetched the bytes before deciding the handset was allowed to
 * have them.
 */
import { fakePillarHandle } from '@pops/pillar-sdk/testing';

import type { CallResult } from '@pops/pillar-sdk/server';

import type { PillarHandleFactory } from '../pillars/gateway.js';

export interface ReceiptBytesCall {
  sha256: string;
}

export interface ReceiptBytesFake {
  factory: PillarHandleFactory;
  /** Every `receipt.read` input bfm sent, in order. */
  reads: ReceiptBytesCall[];
  /** Every `receipt.thumbnail` input bfm sent, in order. */
  thumbnails: ReceiptBytesCall[];
}

function readSha(input: unknown): ReceiptBytesCall {
  if (
    input !== null &&
    typeof input === 'object' &&
    'sha256' in input &&
    typeof input.sha256 === 'string'
  ) {
    return { sha256: input.sha256 };
  }
  throw new Error('[bfm-test] a receipt byte route was called without a sha256');
}

/**
 * Build the fake.
 *
 * @param answers What each route answers. A route the test did not configure
 *   answers the producer's own 404 shape rather than throwing: "the other
 *   route was not the one called" is a fact a test should be able to assert
 *   through the recorded calls, not a crash that hides which one ran.
 */
export function createReceiptBytesFake(answers: {
  read?: CallResult<unknown>;
  thumbnail?: CallResult<unknown>;
}): ReceiptBytesFake {
  const reads: ReceiptBytesCall[] = [];
  const thumbnails: ReceiptBytesCall[] = [];

  const absent = (sha256: string): CallResult<unknown> => ({
    kind: 'not-found',
    pillar: 'purchases',
    message: `No receipt is stored under ${sha256}`,
  });

  const read = (input: unknown): Promise<CallResult<unknown>> => {
    const call = readSha(input);
    reads.push(call);
    return Promise.resolve(answers.read ?? absent(call.sha256));
  };

  const thumbnail = (input: unknown): Promise<CallResult<unknown>> => {
    const call = readSha(input);
    thumbnails.push(call);
    return Promise.resolve(answers.thumbnail ?? absent(call.sha256));
  };

  return {
    factory: <TRouter>() =>
      fakePillarHandle<TRouter>('purchases', { receipt: { read, thumbnail } }),
    reads,
    thumbnails,
  };
}
