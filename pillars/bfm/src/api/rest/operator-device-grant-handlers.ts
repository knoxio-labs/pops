import { readDeviceGrant, replaceDeviceGrant } from '../../db/services/device-grants.js';
import { bfmErrorBody } from '../errors.js';
import { readPrincipal, requireOperator } from '../middleware/identity.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';
import type { Response } from 'express';

import type { bfmOperatorContract } from '../../contract/rest-operator.js';
import type { BfmDb } from '../../db/index.js';
import type { DeviceGrantResult } from '../../db/services/device-grants.js';

type Req = ServerInferRequest<typeof bfmOperatorContract>;
function response(result: DeviceGrantResult) {
  switch (result.outcome) {
    case 'ok':
      return { status: 200 as const, body: result.grant };
    case 'not-found':
      return { status: 404 as const, body: bfmErrorBody('not_found') };
    case 'forbidden':
      return { status: 403 as const, body: bfmErrorBody('operator_forbidden') };
    case 'conflict':
      return { status: 409 as const, body: bfmErrorBody('device_grant_conflict') };
  }
}

/** Human Access operator only; pairing-scoped service accounts and mobile tokens confer no authority here. */
export function makeOperatorDeviceGrantHandlers(db: BfmDb) {
  return {
    getDeviceGrant: ({ params, res }: Req['getDeviceGrant'] & { res: Response }) =>
      runHttp(() => {
        requireOperator(readPrincipal(res));
        return response(readDeviceGrant(db, params.id));
      }),
    replaceDeviceGrant: ({ params, body, res }: Req['replaceDeviceGrant'] & { res: Response }) =>
      runHttp(() => {
        requireOperator(readPrincipal(res));
        return response(replaceDeviceGrant(db, params.id, body));
      }),
  };
}
