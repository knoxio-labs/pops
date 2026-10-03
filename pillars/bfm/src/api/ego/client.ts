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
  };
};

/** Read operations BFM exposes for a phone's Ego conversation list and thread. */
export interface MobileEgoClient {
  listConversations(input: {
    limit?: number;
    offset?: number;
    search?: string;
  }): Promise<GatewayOutcome<MobileEgoConversationPage>>;
  getConversation(id: string): Promise<GatewayOutcome<MobileEgoThread>>;
}

/** Create the mobile Ego read client over BFM's shared pillar gateway. */
export function createMobileEgoClient(gateway: PillarGateway): MobileEgoClient {
  return {
    listConversations: (input) => listConversations(gateway, input),
    getConversation: (id) => getConversation(gateway, id),
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
