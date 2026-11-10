import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { requires } from './capabilities.js';
import { MOBILE_PERIMETER_RESPONSES, MOBILE_REQUEST_RESPONSES } from './rest-mobile-responses.js';
import { MobileUpstreamErrorSchema } from './rest-schemas.js';

const c = initContract();
/** Documents-owned original metadata; neither file representation nor device availability is inferred. */
export const MobileOriginalDocumentSchema = z.object({
  id: z.number(),
  title: z.string(),
  created: z.string(),
  originalFileName: z.string(),
  thumbnailUrl: z.string(),
});
/** Original identity in the Documents pillar, never an Inventory link or Trips association ID. */
export const MobileOriginalDocumentParams = z.object({ id: z.coerce.number().int().positive() });
/** Metadata reads are distinct authority from Trips association reads. */
export const mobileDocumentsContract = c.router({
  getDocument: {
    method: 'GET',
    path: '/mobile/documents/:id',
    pathParams: MobileOriginalDocumentParams,
    metadata: requires('documents.read'),
    responses: {
      200: MobileOriginalDocumentSchema,
      ...MOBILE_PERIMETER_RESPONSES,
      ...MOBILE_REQUEST_RESPONSES,
      404: MobileUpstreamErrorSchema,
      412: MobileUpstreamErrorSchema,
      502: MobileUpstreamErrorSchema,
      503: MobileUpstreamErrorSchema,
    },
    summary: 'Read original metadata from the Documents owner',
  },
});
/** Published Documents original metadata, without synthesized file or offline facts. */
export type MobileOriginalDocument = z.infer<typeof MobileOriginalDocumentSchema>;
