/**
 * A stand-in for the finance pillar on a real socket, for the one property a
 * fake handle cannot show: what bfm puts on the wire.
 *
 * The handle-level finance fake replaces the SDK handle, so nothing it serves
 * ever passes through `pillar()`'s header callback. This one is reached
 * through the real SDK and records the headers of every call. The same server
 * doubles as the registry the SDK discovers finance from.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { BFM_SERVICE_ACCOUNT_SCOPES } from '../pillars/service-account.js';
import {
  answerFinanceRoute,
  financeOpenApiDocument,
  sendJson,
  SUBJECT_HEADER,
  type FinanceHttpState,
  type GuestRole,
} from './finance-http-fake-routes.js';

import type { FinanceFakeAccountRow, FinanceFakeRow } from './finance-fake.js';

/** One call bfm made to a finance data route. */
export interface FinanceHttpCall {
  path: string;
  /** The raw subject header, `undefined` when bfm sent none. */
  subject: string | string[] | undefined;
  apiKey: string | string[] | undefined;
}

export interface FinanceHttpFake {
  baseUrl: string;
  calls: FinanceHttpCall[];
  /** Give `email` a role on `accountId`, as the operator's sharing screen would. */
  grant: (email: string, accountId: string, role: GuestRole) => void;
  revoke: (email: string, accountId: string) => void;
  /** What the presented key holds. Defaults to the scopes bfm asks to be minted with. */
  setKeyScopes: (scopes: readonly string[]) => void;
  /** Answer every data route with a 503, as finance does mid-restart. */
  setOutage: (down: boolean) => void;
  /** List another pillar in the registry this server also plays. */
  registerPeer: (pillarId: string, peerBaseUrl: string) => void;
  close: () => Promise<void>;
}

interface FinanceHttpFakeSeed {
  accounts: readonly FinanceFakeAccountRow[];
  transactions: readonly FinanceFakeRow[];
}

function registryBody(pillars: ReadonlyMap<string, string>): unknown {
  return {
    pillars: [...pillars].map(([pillarId, baseUrl]) => ({
      pillarId,
      baseUrl,
      status: 'healthy',
      manifest: { contract: { version: '0.1.0' } },
      lastSeenAt: '2026-10-07T00:00:00.000Z',
      registered: true,
    })),
  };
}

function controls(
  state: FinanceHttpState,
  pillars: Map<string, string>
): Pick<FinanceHttpFake, 'grant' | 'revoke' | 'setKeyScopes' | 'setOutage' | 'registerPeer'> {
  return {
    grant: (email, accountId, role) => {
      const roles = state.grants.get(email) ?? new Map<string, GuestRole>();
      roles.set(accountId, role);
      state.grants.set(email, roles);
    },
    revoke: (email, accountId) => {
      state.grants.get(email)?.delete(accountId);
    },
    setKeyScopes: (scopes) => {
      state.keyScopes = scopes;
    },
    setOutage: (down) => {
      state.outage = down;
    },
    registerPeer: (pillarId, peerBaseUrl) => {
      pillars.set(pillarId, peerBaseUrl);
    },
  };
}

export async function startFinanceHttpFake(seed: FinanceHttpFakeSeed): Promise<FinanceHttpFake> {
  const calls: FinanceHttpCall[] = [];
  const pillars = new Map<string, string>();
  const state: FinanceHttpState = {
    accounts: seed.accounts,
    transactions: seed.transactions,
    grants: new Map(),
    keyScopes: BFM_SERVICE_ACCOUNT_SCOPES,
    outage: false,
  };

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/registry/pillars') return sendJson(res, 200, registryBody(pillars));
    if (url.pathname === '/openapi') return sendJson(res, 200, financeOpenApiDocument());
    calls.push({
      path: url.pathname,
      subject: req.headers[SUBJECT_HEADER],
      apiKey: req.headers['x-api-key'],
    });
    answerFinanceRoute(state, req, url, res);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port bound');
  const baseUrl = `http://127.0.0.1:${String(address.port)}`;
  pillars.set('finance', baseUrl);

  return {
    baseUrl,
    calls,
    ...controls(state, pillars),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
        server.closeAllConnections();
      }),
  };
}
