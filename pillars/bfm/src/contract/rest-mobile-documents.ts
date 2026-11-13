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
/** Live owner upload policy; no internal URL or count is exposed. */
export const MobileDocumentPolicySchema = z.object({
  configured: z.boolean(),
  available: z.boolean(),
  maxUploadBytes: z.number().int().positive(),
  allowedMimeTypes: z.array(z.string()),
});
/** The owner task identity returned by an accepted raw upload. */
export const MobileDocumentTaskIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,72}$/);
/** Owner task facts; only done/duplicate with documentId establish an original. */
export const MobileDocumentTaskSchema = z.object({
  state: z.enum(['pending', 'done', 'duplicate', 'failed']),
  documentId: z.number().int().positive().nullable(),
  reason: z.string().nullable(),
});
/** Canonical raw owner query; bytes never travel in JSON. */
export const MobileDocumentIngestQuerySchema = z.strictObject({
  fileName: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[^\p{Cc}]+$/u),
  title: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[^\p{Cc}]+$/u)
    .optional(),
});
/** Accepted task proof is distinct from a completed original. */
export const MobileDocumentAcceptedSchema = z.strictObject({ taskId: MobileDocumentTaskIdSchema });
/** Published upload policy. */
export type MobileDocumentPolicy = z.infer<typeof MobileDocumentPolicySchema>;
/** Published owner task status. */
export type MobileDocumentTask = z.infer<typeof MobileDocumentTaskSchema>;
/** Canonical filename/title upload metadata. */
export type MobileDocumentIngestQuery = z.infer<typeof MobileDocumentIngestQuerySchema>;
/** Metadata reads are distinct authority from Trips association reads. */
export const mobileDocumentsContract = c.router({
  status: {
    method: 'GET',
    path: '/mobile/documents/status',
    metadata: requires('documents.read'),
    responses: {
      200: MobileDocumentPolicySchema,
      ...MOBILE_PERIMETER_RESPONSES,
      ...MOBILE_REQUEST_RESPONSES,
      502: MobileUpstreamErrorSchema,
      503: MobileUpstreamErrorSchema,
    },
    summary: 'Read live Documents upload policy without granting upload authority',
  },
  task: {
    method: 'GET',
    path: '/mobile/documents/tasks/:taskId',
    pathParams: z.object({ taskId: MobileDocumentTaskIdSchema }),
    metadata: requires('documents.read'),
    responses: {
      200: MobileDocumentTaskSchema,
      ...MOBILE_PERIMETER_RESPONSES,
      ...MOBILE_REQUEST_RESPONSES,
      404: MobileUpstreamErrorSchema,
      412: MobileUpstreamErrorSchema,
      502: MobileUpstreamErrorSchema,
      503: MobileUpstreamErrorSchema,
    },
    summary: 'Read the owner task without inferring an original from acceptance',
  },
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
