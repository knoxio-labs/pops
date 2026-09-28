import { MobileCodeSuggestResponseSchema } from '../../contract/mobile-inventory-mutation-schemas.js';
import { parseOrMismatch } from '../pillars/parse-response.js';

import type { GatewayOutcome, PillarGateway } from '../pillars/gateway.js';
import type { SuggestCodesRequest } from './client.js';

const INVENTORY_PILLAR_ID = 'inventory';

type InventoryCodesRouter = {
  codes: {
    suggest: (input: { name: string; typeKey?: string; stem?: string }) => Promise<unknown>;
  };
};

/** Requests deterministic code suggestions through the inventory gateway. */
export async function callSuggestCodes(
  gateway: PillarGateway,
  request: SuggestCodesRequest
): Promise<GatewayOutcome<{ suggestions: string[] }>> {
  const outcome = await gateway.call<InventoryCodesRouter, unknown>(INVENTORY_PILLAR_ID, (handle) =>
    handle.codes.suggest({
      name: request.name,
      ...(request.typeKey === null ? {} : { typeKey: request.typeKey }),
      ...(request.stem === null ? {} : { stem: request.stem }),
    })
  );
  return parseOrMismatch(
    INVENTORY_PILLAR_ID,
    outcome,
    MobileCodeSuggestResponseSchema,
    'codes.suggest'
  );
}
