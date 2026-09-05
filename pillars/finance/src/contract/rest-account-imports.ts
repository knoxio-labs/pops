/**
 * `accounts/:id/imports` and `accounts/:id/import-config` sub-router
 * (POPS-2917, ADR-052).
 *
 * The batches list is read-only: a batch is what an import did, appended by
 * the commit and never edited here. The config is a single row per account
 * written whole by `PUT`; there is no `PATCH` because a config whose kind
 * changed must also change what the kind needs, and a partial write could
 * leave a `csv-dialect` row carrying only an Up account id.
 *
 * The summary of both — last import, span, cadence — rides on every accounts
 * response as `importStatus` rather than on a route of its own, so the grid,
 * the account page and the staleness nudge read one answer.
 *
 * `sync` (POPS-2921) is the one action an `api` source offers: it starts the
 * same pass the scheduler runs and answers 202 with a job to poll, or with the
 * job already running for the account when one is — two triggers serialise
 * rather than race for the same rows.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  ImportBatchesQuerySchema,
  ImportBatchPageSchema,
  ImportConfigSchema,
  WriteImportConfigBodySchema,
} from './rest-account-imports-schemas.js';
import { UpSyncJobSchema } from './rest-account-sync-schemas.js';
import { ERR_RESPONSES, ERR_RESPONSES_WITH_422 } from './rest-schemas.js';

const c = initContract();

const AccountParams = z.object({ id: z.string() });

export const financeAccountImportsContract = c.router({
  listBatches: {
    method: 'GET',
    path: '/accounts/:id/imports',
    pathParams: AccountParams,
    query: ImportBatchesQuerySchema,
    responses: { 200: ImportBatchPageSchema, ...ERR_RESPONSES },
    summary: 'List the import batches that fed an account, newest first, paginated on createdAt',
  },
  getConfig: {
    method: 'GET',
    path: '/accounts/:id/import-config',
    pathParams: AccountParams,
    responses: { 200: z.object({ data: ImportConfigSchema }), ...ERR_RESPONSES },
    summary: 'How an account expects to be fed; 404 for an account with no config',
  },
  writeConfig: {
    method: 'PUT',
    path: '/accounts/:id/import-config',
    pathParams: AccountParams,
    body: WriteImportConfigBodySchema,
    responses: {
      200: z.object({ data: ImportConfigSchema, message: z.string() }),
      ...ERR_RESPONSES_WITH_422,
    },
    summary:
      'Create or replace an account’s import config; 422s a config missing what its kind needs ' +
      '(a dialect, a parser or a provider)',
  },
  triggerSync: {
    method: 'POST',
    path: '/accounts/:id/sync',
    pathParams: AccountParams,
    body: z.object({}).optional(),
    responses: { 202: z.object({ data: UpSyncJobSchema }), ...ERR_RESPONSES_WITH_422 },
    summary:
      'Start an Up sync for an account fed by the Up API, or report the one already running; ' +
      '422 for an account not fed that way',
  },
  getSyncJob: {
    method: 'GET',
    path: '/accounts/:id/sync/:jobId',
    pathParams: z.object({ id: z.string(), jobId: z.string() }),
    responses: { 200: z.object({ data: UpSyncJobSchema }), ...ERR_RESPONSES },
    summary: 'Progress and result of one sync job; 404 once it has expired',
  },
});
