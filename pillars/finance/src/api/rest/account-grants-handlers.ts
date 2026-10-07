/**
 * Handlers for the `accountGrants.*` sub-router (POPS-5864).
 *
 * Who may call these is the scope gate's decision, made before any of this
 * runs: the routes carry no `guestRoute()`, so a guest never reaches here.
 */
import { readPrincipal } from '@pops/pillar-express';

import { accountGrantsService, type FinanceDb } from '../../db/index.js';
import { NotFoundError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';
import { requireAccount } from './require-account.js';

import type { ServerInferRequest } from '@ts-rest/core';
import type { Response } from 'express';

import type { financeAccountGrantsContract } from '../../contract/rest-account-grants.js';

type Req = ServerInferRequest<typeof financeAccountGrantsContract>;

/** The email to record as the granter. A machine caller and a LAN request carry none. */
function granterEmail(res: Response): string | null {
  const principal = readPrincipal(res);
  return principal.kind === 'operator' ? principal.email : null;
}

export function makeAccountGrantsHandlers(db: FinanceDb) {
  return {
    list: ({ params }: Req['list']) =>
      runHttp(() => {
        requireAccount(db, params.id);
        return {
          status: 200 as const,
          body: { data: accountGrantsService.listGrantsForAccount(db, params.id) },
        };
      }),

    put: ({ params, body, res }: Req['put'] & { res: Response }) =>
      runHttp(() => {
        requireAccount(db, params.id);
        const grant = accountGrantsService.upsertGrant(db, {
          accountId: params.id,
          email: body.email,
          role: body.role,
          actor: granterEmail(res),
        });
        return { status: 200 as const, body: { data: grant, message: 'Access granted' } };
      }),

    remove: ({ params }: Req['remove']) =>
      runHttp(() => {
        requireAccount(db, params.id);
        if (!accountGrantsService.revokeGrant(db, params.id, params.grantId)) {
          throw new NotFoundError('Grant', params.grantId);
        }
        return { status: 204 as const, body: undefined };
      }),
  };
}
