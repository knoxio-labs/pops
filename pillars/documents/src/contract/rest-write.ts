/**
 * `write.*` sub-router — the contract routes that change Paperless. Upload
 * is the raw `POST /paperless/documents` beside it (`api/files/`), scoped
 * under the same `documents.write` root.
 *
 * Writes sit outside `paperless.*` so that a `documents.paperless` grant, which
 * read-only callers already hold, never reaches them.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { PaperlessDocumentSchema } from './rest-paperless.js';
import { ErrorBodySchema } from './rest-schemas.js';

const c = initContract();

const DocumentIdParams = z.object({ id: z.coerce.number().int().positive() });

const failures = {
  404: ErrorBodySchema,
  412: ErrorBodySchema,
  502: ErrorBodySchema,
  503: ErrorBodySchema,
} as const;

export const documentsWriteContract = c.router({
  update: {
    method: 'PATCH',
    path: '/paperless/documents/:id',
    pathParams: DocumentIdParams,
    body: z.object({ title: z.string().max(128).optional() }).strict(),
    responses: {
      200: z.object({ data: PaperlessDocumentSchema }),
      400: ErrorBodySchema,
      ...failures,
    },
    summary: 'Change the given fields of a Paperless-ngx document; absent fields are left alone',
  },
  delete: {
    method: 'DELETE',
    path: '/paperless/documents/:id',
    pathParams: DocumentIdParams,
    body: c.noBody(),
    responses: { 204: c.noBody(), ...failures },
    summary:
      'Delete a Paperless-ngx document (Paperless moves it to its trash); unaware of links to it',
  },
});
