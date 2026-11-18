import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from './rest-schemas.js';
import { UploadInputSchema, UploadParamsSchema, UploadRecordSchema } from './upload-schemas.js';

const c = initContract();
const response = z.strictObject({ data: UploadRecordSchema });
const failures = {
  400: ErrorBodySchema,
  404: ErrorBodySchema,
  409: ErrorBodySchema,
  412: ErrorBodySchema,
  413: ErrorBodySchema,
  415: ErrorBodySchema,
  503: ErrorBodySchema,
} as const;

/** Read-side durable upload lookup, kept outside the write scope. */
export const uploadReadRoute = {
  method: 'GET',
  path: '/paperless/uploads/:operationId',
  pathParams: UploadParamsSchema,
  responses: { 200: response, ...failures },
  summary: 'Recover durable upload proof; unknown upstream outcomes never authorize another POST',
} as const;

/** Write-side JSON operations; content is the separately scope-projected raw PUT. */
export const uploadWriteRoutes = {
  createUpload: {
    method: 'POST',
    path: '/paperless/uploads',
    body: UploadInputSchema,
    responses: { 200: response, ...failures },
    summary:
      'Create or replay an immutable durable upload intent; does not send bytes to Paperless',
  },
  dispatchUpload: {
    method: 'POST',
    path: '/paperless/uploads/:operationId/dispatch',
    pathParams: UploadParamsSchema,
    body: c.noBody(),
    responses: { 200: response, ...failures },
    summary: 'Claim one upstream POST, or recover its recorded result without redispatching',
  },
} as const;
