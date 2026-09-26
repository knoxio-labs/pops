/**
 * bfm's barcode leg: one bounded call to the barcode pillar, with the
 * provider-independent product shape validated before it reaches the phone.
 */
import { MobileBarcodeLookupOutcomeSchema } from '../../contract/rest-mobile-barcode.js';
import { parseOrMismatch } from '../pillars/parse-response.js';

import type { MobileBarcodeLookupOutcome } from '../../contract/rest-mobile-barcode.js';
import type { GatewayOutcome, PillarGateway } from '../pillars/gateway.js';

const BARCODE_PILLAR_ID = 'barcode';

/** The outer bfm deadline around the barcode pillar's own lookup budget. */
export const BARCODE_LOOKUP_TIMEOUT_MS = 10_000;

type BarcodeRouter = {
  lookup: {
    get: (input: { code: string }) => Promise<unknown>;
  };
};

/** Typed barcode operations available to bfm's mobile handlers. */
export interface MobileBarcodeClient {
  lookup(code: string): Promise<GatewayOutcome<MobileBarcodeLookupOutcome>>;
}

const TIMED_OUT = Symbol('barcode-lookup-timed-out');

/** Create the barcode client over a shared pillar gateway. */
export function createMobileBarcodeClient(gateway: PillarGateway): MobileBarcodeClient {
  return {
    lookup: (code) => lookupBarcode(gateway, code),
  };
}

async function lookupBarcode(
  gateway: PillarGateway,
  code: string
): Promise<GatewayOutcome<MobileBarcodeLookupOutcome>> {
  const call = gateway.call<BarcodeRouter, unknown>(BARCODE_PILLAR_ID, (handle) =>
    handle.lookup.get({ code })
  );
  const outcome = await raceTimeout(call, BARCODE_LOOKUP_TIMEOUT_MS);
  if (outcome === TIMED_OUT) {
    return { kind: 'unavailable', pillar: BARCODE_PILLAR_ID, status: 503 };
  }

  return parseOrMismatch(
    BARCODE_PILLAR_ID,
    outcome,
    MobileBarcodeLookupOutcomeSchema,
    'lookup.get'
  );
}

async function raceTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
