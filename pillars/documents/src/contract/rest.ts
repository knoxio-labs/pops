/**
 * REST contract for the documents pillar — ts-rest single source of truth.
 *
 * Composes the `paperless.*` sub-router (currently the pillar's only
 * domain — the paperless-ngx bridge). `generateOpenApi(documentsContract, …)`
 * projects this to `openapi/documents.openapi.json`.
 *
 * Lego principle: this is the ONLY description of the documents wire
 * format. Don't hand-author OpenAPI or hand-author paths anywhere else.
 */
import { initContract } from '@ts-rest/core';

import { documentsPaperlessContract } from './rest-paperless.js';

const c = initContract();

export const documentsContract = c.router(
  {
    paperless: documentsPaperlessContract,
  },
  {
    pathPrefix: '',
    strictStatusCodes: false,
  }
);

export type DocumentsContract = typeof documentsContract;
