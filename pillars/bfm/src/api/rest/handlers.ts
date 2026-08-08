/**
 * ts-rest handler composer for the bfm pillar — the typed
 * `RouterImplementation<BfmContract>` that `createExpressEndpoints` consumes
 * in `app.ts`.
 */
import { initServer } from '@ts-rest/express';

import { bfmContract } from '../../contract/rest.js';

const server: ReturnType<typeof initServer> = initServer();

export interface BfmRestHandlerDeps {
  /** Build version, surfaced on the health response. */
  version: string;
}

export function makeBfmRestHandlers(
  deps: BfmRestHandlerDeps
): ReturnType<typeof server.router<typeof bfmContract>> {
  return server.router(bfmContract, {
    health: async () => ({
      status: 200,
      body: {
        ok: true,
        status: 'ok',
        pillar: 'bfm',
        version: deps.version,
        ts: new Date().toISOString(),
      },
    }),
  });
}
