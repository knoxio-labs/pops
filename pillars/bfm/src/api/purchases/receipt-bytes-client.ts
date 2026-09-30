import { type GatewayOutcome, type PillarGateway, isGatewayOk } from '../pillars/gateway.js';
import { parseOrMismatch } from '../pillars/parse-response.js';
import { PurchasesReceiptBytesSchema } from './wire.js';

import type { CallResult, PillarHandle } from '@pops/pillar-sdk/server';

import type { MobileReceiptBytes } from '../../contract/rest-schemas.js';

const PURCHASES_PILLAR_ID = 'purchases';

type PurchasesReceiptBytesRouter = {
  receipt: {
    read: (input: { sha256: string }) => Promise<unknown>;
    thumbnail: (input: { sha256: string }) => Promise<unknown>;
  };
};

type ReceiptBytesOperation = 'receipt.read' | 'receipt.thumbnail';

/** Read receipt bytes unchanged so the returned content still matches its hash. */
export async function fetchPurchaseReceiptBytes(
  gateway: PillarGateway,
  operation: ReceiptBytesOperation,
  invoke: (handle: PillarHandle<PurchasesReceiptBytesRouter>) => Promise<CallResult<unknown>>
): Promise<GatewayOutcome<MobileReceiptBytes>> {
  const outcome = await gateway.call<PurchasesReceiptBytesRouter, unknown>(
    PURCHASES_PILLAR_ID,
    invoke
  );
  const answered = parseOrMismatch(
    PURCHASES_PILLAR_ID,
    outcome,
    PurchasesReceiptBytesSchema,
    operation
  );
  if (!isGatewayOk(answered)) return answered;

  return { kind: 'ok', value: answered.value };
}
