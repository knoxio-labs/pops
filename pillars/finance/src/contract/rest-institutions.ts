/**
 * `institutions.*` sub-router — institution list/create/delete (POPS-2803).
 *
 * `accounts.institution_id` will foreign-key onto this table once POPS-2767
 * lands; until then this is a standalone growable list a client can read and
 * add to. `colour` is required (hex, for the initials fallback shown when an
 * institution has no logo); `logoAssetId` is nullable — the upload flow that
 * populates it is POPS-2804, not yet built.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES, MessageSchema } from './rest-schemas.js';

const c = initContract();

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

/** Wire shape served by the institutions handlers. */
export const InstitutionSchema = z.object({
  id: z.string(),
  name: z.string(),
  colour: z.string(),
  logoAssetId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const CreateInstitutionBody = z.object({
  name: z.string().min(1, 'Name is required'),
  colour: z.string().regex(HEX_COLOUR, 'Colour must be a hex value like #rrggbb'),
  logoAssetId: z.string().nullable().optional(),
});

const UpdateInstitutionBody = z.object({
  name: z.string().min(1, 'Name cannot be empty').optional(),
  colour: z.string().regex(HEX_COLOUR, 'Colour must be a hex value like #rrggbb').optional(),
});

const InstitutionMutation = z.object({ data: InstitutionSchema, message: z.string() });

/** Kept in sync with `LOGO_ALLOWED_CONTENT_TYPES` in `src/api/modules/logo-upload.ts`. */
const UploadLogoBody = z.object({
  contentType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  /** Base64-encoded image bytes. The handler decodes this to a Buffer. */
  contentBase64: z.string().min(1, 'Logo content is required'),
});

export const financeInstitutionsContract = c.router({
  list: {
    method: 'GET',
    path: '/institutions',
    responses: { 200: z.object({ data: z.array(InstitutionSchema) }) },
    summary: 'List every institution',
  },
  create: {
    method: 'POST',
    path: '/institutions',
    body: CreateInstitutionBody,
    responses: { 201: InstitutionMutation, ...ERR_RESPONSES },
    summary: 'Register a new institution',
  },
  update: {
    method: 'PATCH',
    path: '/institutions/:id',
    pathParams: z.object({ id: z.string() }),
    body: UpdateInstitutionBody,
    responses: { 200: InstitutionMutation, ...ERR_RESPONSES },
    summary: 'Rename an institution and/or change its colour',
  },
  delete: {
    method: 'DELETE',
    path: '/institutions/:id',
    pathParams: z.object({ id: z.string() }),
    body: z.object({}).optional(),
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Delete an institution, refused while any account still references it',
  },
  uploadLogo: {
    method: 'POST',
    path: '/institutions/:id/logo',
    pathParams: z.object({ id: z.string() }),
    body: UploadLogoBody,
    responses: { 200: InstitutionMutation, ...ERR_RESPONSES },
    summary: 'Upload (or replace) an institution logo (base64, 2 MiB cap, PNG/JPEG/WEBP only)',
  },
  removeLogo: {
    method: 'DELETE',
    path: '/institutions/:id/logo',
    pathParams: z.object({ id: z.string() }),
    body: z.object({}).optional(),
    responses: { 200: InstitutionMutation, ...ERR_RESPONSES },
    summary: 'Remove an institution logo, falling back to the initials mark',
  },
});
