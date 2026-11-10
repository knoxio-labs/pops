import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from '@pops/types';

const c = initContract();
const Trip = z.object({ tripId: z.coerce.number().int().positive() });
const AssociationId = Trip.extend({ id: z.coerce.number().int().positive() });
/** Documents may be associated with a route object whose identity Trips owns. */
export const DOCUMENT_TARGET_KINDS = ['trip', 'visit', 'journey', 'stay', 'event'] as const;
/** Runtime contract for supported Trips-owned document targets. */
export const DocumentTargetKindSchema = z.enum(DOCUMENT_TARGET_KINDS);
/** One explicit association record; `documentId` remains owned by Documents. */
export const TripDocumentAssociationSchema = z.object({
  id: z.number().int().positive(),
  tripId: z.number().int().positive(),
  documentId: z.number().int().positive(),
  targetKind: DocumentTargetKindSchema,
  targetId: z.number().int().positive(),
  createdAt: z.iso.datetime(),
});
/** Target types supported by the approved Trips document association contract. */
export type DocumentTargetKind = z.infer<typeof DocumentTargetKindSchema>;
/** Wire representation of a Trips-owned link to a Documents original. */
export type TripDocumentAssociation = z.infer<typeof TripDocumentAssociationSchema>;
const CreateAssociation = z.object({
  documentId: z.number().int().positive(),
  targetKind: DocumentTargetKindSchema,
  targetId: z.number().int().positive(),
});
const errors = { 400: ErrorBodySchema, 404: ErrorBodySchema };

/** Trips-owned references to Documents originals and explicitly selected route targets. */
export const documentAssociationsContract = c.router({
  list: {
    method: 'GET',
    path: '/trips/:tripId/document-associations',
    pathParams: Trip,
    responses: {
      200: z.object({ associations: z.array(TripDocumentAssociationSchema) }),
      ...errors,
    },
  },
  create: {
    method: 'POST',
    path: '/trips/:tripId/document-associations',
    pathParams: Trip,
    body: CreateAssociation,
    responses: { 201: TripDocumentAssociationSchema, 409: ErrorBodySchema, ...errors },
  },
  delete: {
    method: 'DELETE',
    path: '/trips/:tripId/document-associations/:id',
    pathParams: AssociationId,
    body: c.noBody(),
    responses: { 204: c.noBody(), ...errors },
  },
});
