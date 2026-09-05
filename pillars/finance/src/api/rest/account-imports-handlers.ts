/**
 * Handlers for the `accountImports.*` sub-router (POPS-2917, ADR-052).
 *
 * `getConfig` 404s an account that has no config rather than serving a null:
 * the row is the account's standing instruction for how to be fed, and an
 * account fed by hand has none, in the same way it has no gift-card details.
 * `writeConfig` maps the service's "this kind needs that field" refusal to
 * 422, since the body was well-formed and only meaningless.
 */
import {
  accountImportConfigService,
  ImportConfigInvalidError,
  importBatchesService,
  type FinanceDb,
} from '../../db/index.js';
import {
  toImportBatch,
  toImportConfig,
  toUpsertImportConfigInput,
} from '../modules/account-imports-types.js';
import { NotFoundError, UnprocessableEntityError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';
import { requireAccount } from './require-account.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { financeAccountImportsContract } from '../../contract/rest-account-imports.js';

type Req = ServerInferRequest<typeof financeAccountImportsContract>;

const DEFAULT_LIMIT = 50;

export function makeAccountImportsHandlers(db: FinanceDb) {
  return {
    listBatches: ({ params, query }: Req['listBatches']) =>
      runHttp(() => {
        requireAccount(db, params.id);
        const page = importBatchesService.listBatchesForAccount(db, params.id, {
          limit: query.limit ?? DEFAULT_LIMIT,
          before: query.before,
        });
        return {
          status: 200 as const,
          body: { data: page.items.map(toImportBatch), nextBefore: page.nextBefore ?? null },
        };
      }),

    getConfig: ({ params }: Req['getConfig']) =>
      runHttp(() => {
        requireAccount(db, params.id);
        const row = accountImportConfigService.getImportConfig(db, params.id);
        if (row === undefined) throw new NotFoundError('Import config', params.id);
        return { status: 200 as const, body: { data: toImportConfig(row) } };
      }),

    writeConfig: ({ params, body }: Req['writeConfig']) =>
      runHttp(() => {
        requireAccount(db, params.id);
        try {
          const row = accountImportConfigService.upsertImportConfig(
            db,
            toUpsertImportConfigInput(params.id, body)
          );
          return {
            status: 200 as const,
            body: { data: toImportConfig(row), message: 'Import config saved' },
          };
        } catch (err) {
          if (err instanceof ImportConfigInvalidError) {
            throw new UnprocessableEntityError(err.message);
          }
          throw err;
        }
      }),
  };
}
