/**
 * The phone's barcode lookup surface. bfm owns this wire shape so the mobile
 * client does not depend on the barcode pillar's provider-facing contract.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { requires } from './capabilities.js';
import { MOBILE_PERIMETER_RESPONSES, MOBILE_REQUEST_RESPONSES } from './rest-mobile-responses.js';

const c = initContract();

/** The provider-independent book metadata returned by the barcode pillar. */
export const MobileBarcodeProductSchema = z.object({
  code: z.string().min(1),
  kind: z.literal('book'),
  title: z.string().min(1),
  subtitle: z.string().min(1).optional(),
  contributors: z.array(
    z.object({
      name: z.string().min(1),
      role: z.string().min(1).optional(),
    })
  ),
  publisher: z.string().min(1).optional(),
  publishedDate: z.string().min(1).optional(),
  pageCount: z.number().int().positive().optional(),
  language: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  subjects: z.array(z.string()),
  imageUrls: z.array(z.string().url()),
  source: z.enum(['open_library', 'google_books']),
  fetchedAt: z.string().min(1),
  attributes: z.record(z.string(), z.string()),
});

/** The complete 200 response from `GET /mobile/barcode/lookup/:code`. */
export const MobileBarcodeLookupOutcomeSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('found'), product: MobileBarcodeProductSchema }),
  z.object({ outcome: z.literal('not_found') }),
  z.object({ outcome: z.literal('unavailable') }),
]);

/** Inferred barcode product shape exposed to mobile consumers. */
export type MobileBarcodeProduct = z.infer<typeof MobileBarcodeProductSchema>;

/** Inferred result shape exposed to mobile consumers. */
export type MobileBarcodeLookupOutcome = z.infer<typeof MobileBarcodeLookupOutcomeSchema>;

/** The bfm-owned barcode lookup contract used by the mobile router. */
export const mobileBarcodeContract = c.router({
  lookup: {
    method: 'GET',
    path: '/mobile/barcode/lookup/:code',
    pathParams: z.object({ code: z.string().min(1) }),
    responses: {
      200: MobileBarcodeLookupOutcomeSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
    },
    summary: 'Look up book metadata for a scanned barcode',
    metadata: requires('barcode.read'),
  },
});

/** Type-level view of bfm's mobile barcode contract. */
export type MobileBarcodeContract = typeof mobileBarcodeContract;
