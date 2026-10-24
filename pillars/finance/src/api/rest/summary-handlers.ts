/**
 * Handler for the `summary.*` sub-router (POPS-3589).
 *
 * Thin by design: every decision the summary embodies — what counts as spend,
 * what the previous period is, what an unmeasured category looks like — lives
 * in `db/services/summary*.ts`, because the MCP tools and the dashboard must
 * not be able to disagree about any of it.
 */
import { financeSummary, type FinanceDb } from '../../db/index.js';
import { loadEntityIdentities } from '../contacts/identity-snapshot.js';
import { type ContactsClient } from '../contacts/types.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { financeSummaryContract } from '../../contract/rest-summary.js';

type Req = ServerInferRequest<typeof financeSummaryContract>;

export function makeSummaryHandlers(db: FinanceDb, contacts: ContactsClient) {
  return {
    get: ({ query }: Req['get']) =>
      runHttp(async () => {
        const identities = await loadEntityIdentities(db, contacts);
        return {
          status: 200 as const,
          body: {
            data: financeSummary(db, {
              window: query.window,
              topLimit: query.topLimit,
              identities,
            }),
          },
        };
      }),
  };
}
