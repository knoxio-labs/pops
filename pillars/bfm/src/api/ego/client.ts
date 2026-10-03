import { isGatewayOk, type GatewayOutcome, type PillarGateway } from '../pillars/gateway.js';
import { parseOrMismatch } from '../pillars/parse-response.js';
import {
  toMobileConversationPage,
  toMobileThread,
  UpstreamEgoConversationPageSchema,
  UpstreamEgoThreadSchema,
} from './wire.js';

import type { z } from 'zod';

import type {
  MobileEgoBatchDecisionBody,
  MobileEgoBatchOutcome,
  MobileEgoConversationPageSchema,
  MobileEgoThreadSchema,
} from '../../contract/mobile-ego-schemas.js';

type MobileEgoConversationPage = z.infer<typeof MobileEgoConversationPageSchema>;
type MobileEgoThread = z.infer<typeof MobileEgoThreadSchema>;

/** The cerebrum pillar that owns Ego conversations. */
export const EGO_PILLAR_ID = 'cerebrum';

type EgoRouter = {
  ego: {
    listConversations: (input: {
      limit?: number;
      offset?: number;
      search?: string;
    }) => Promise<unknown>;
    getConversation: (input: { id: string }) => Promise<unknown>;
    decideActionBatch: (input: {
      params: { batchId: string };
      body: MobileEgoBatchDecisionBody;
    }) => Promise<unknown>;
  };
};

/** Ego conversation and action-batch operations BFM exposes to the mobile client. */
export interface MobileEgoClient {
  listConversations(input: {
    limit?: number;
    offset?: number;
    search?: string;
  }): Promise<GatewayOutcome<MobileEgoConversationPage>>;
  getConversation(id: string): Promise<GatewayOutcome<MobileEgoThread>>;
  decideBatch(
    batchId: string,
    decision: MobileEgoBatchDecisionBody
  ): Promise<GatewayOutcome<MobileEgoBatchOutcome>>;
}

/** Create the mobile Ego read client over BFM's shared pillar gateway. */
export function createMobileEgoClient(gateway: PillarGateway): MobileEgoClient {
  return {
    listConversations: (input) => listConversations(gateway, input),
    getConversation: (id) => getConversation(gateway, id),
    decideBatch: (batchId, decision) => decideBatch(gateway, batchId, decision),
  };
}

async function listConversations(
  gateway: PillarGateway,
  input: { limit?: number; offset?: number; search?: string }
): Promise<GatewayOutcome<MobileEgoConversationPage>> {
  const response = await gateway.call<EgoRouter, unknown>(EGO_PILLAR_ID, (handle) =>
    handle.ego.listConversations(input)
  );
  const parsed = parseOrMismatch(
    EGO_PILLAR_ID,
    response,
    UpstreamEgoConversationPageSchema,
    'ego.listConversations'
  );
  return isGatewayOk(parsed)
    ? { kind: 'ok', value: toMobileConversationPage(parsed.value) }
    : parsed;
}

async function getConversation(
  gateway: PillarGateway,
  id: string
): Promise<GatewayOutcome<MobileEgoThread>> {
  const response = await gateway.call<EgoRouter, unknown>(EGO_PILLAR_ID, (handle) =>
    handle.ego.getConversation({ id })
  );
  const parsed = parseOrMismatch(
    EGO_PILLAR_ID,
    response,
    UpstreamEgoThreadSchema,
    'ego.getConversation'
  );
  return isGatewayOk(parsed) ? { kind: 'ok', value: toMobileThread(parsed.value) } : parsed;
}

async function decideBatch(
  gateway: PillarGateway,
  batchId: string,
  decision: MobileEgoBatchDecisionBody
): Promise<GatewayOutcome<MobileEgoBatchOutcome>> {
  const response = await gateway.call<EgoRouter, unknown>(EGO_PILLAR_ID, (handle) =>
    handle.ego.decideActionBatch({ params: { batchId }, body: decision })
  );
  return isGatewayOk(response) ? { kind: 'ok', value: { batchId } } : response;
}
