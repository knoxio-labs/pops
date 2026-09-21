/**
 * The phone's view of `contacts`: finding, naming and creating a merchant
 * (POPS-3753), and a merchant's recorded addresses (ADR-053).
 *
 * Exists so the receipt review screen's merchant and address pickers have
 * something to read from and write to — "search contacts for a merchant"
 * only means something once a route can answer it. Two capabilities, on the
 * same reasoning `purchases.read`/`purchases.write` are split: reading what
 * is already recorded and minting a new record are different authorities,
 * and every route below leans on one of the two rather than a third.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { requires } from './capabilities.js';
import {
  MOBILE_PERIMETER_RESPONSES,
  MOBILE_REQUEST_RESPONSES,
  MOBILE_UPSTREAM_RESPONSES,
  MobilePageLimit,
} from './rest-mobile-responses.js';
import {
  MobileAddressListSchema,
  MobileAddressSchema,
  MobileMerchantListSchema,
  MobileMerchantSchema,
  MobileUpstreamErrorSchema,
} from './rest-schemas.js';

const c = initContract();

export const mobileContactsContract = c.router({
  // Declared ahead of `getMerchant` on purpose: both would otherwise collide
  // on the same depth, and a fixed `/search` segment must be registered
  // before the `:id` route it would otherwise be swallowed by.
  searchMerchants: {
    method: 'GET',
    path: '/mobile/contacts/merchants/search',
    query: z.object({
      /** Free text, matched against a merchant's name and its aliases. */
      q: z.string().trim().min(1),
      limit: MobilePageLimit,
    }),
    responses: {
      200: MobileMerchantListSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary:
      "Merchants matching free text, for the review form's merchant picker — there are hundreds, so matching happens here, not on the phone",
    metadata: requires('contacts.entities.read'),
  },
  getMerchant: {
    method: 'GET',
    path: '/mobile/contacts/merchants/:id',
    pathParams: z.object({ id: z.string() }),
    responses: {
      200: MobileMerchantSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      404: MobileUpstreamErrorSchema,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: 'One merchant by id, for a draft that arrives already matched',
    metadata: requires('contacts.entities.read'),
  },
  createMerchant: {
    method: 'POST',
    path: '/mobile/contacts/merchants',
    body: z.object({ name: z.string().trim().min(1) }),
    responses: {
      200: MobileMerchantSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary:
      "Record a new merchant from the reader's own wording. Idempotent by name: a repeated call with the same name answers the same id rather than a conflict",
    metadata: requires('contacts.entities.write'),
  },
  getMerchantAddresses: {
    method: 'GET',
    path: '/mobile/contacts/merchants/:id/addresses',
    pathParams: z.object({ id: z.string() }),
    responses: {
      200: MobileAddressListSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      404: MobileUpstreamErrorSchema,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: "Every address recorded against one merchant, for the review screen's address picker",
    metadata: requires('contacts.entities.read'),
  },
  createMerchantAddress: {
    method: 'POST',
    path: '/mobile/contacts/merchants/:id/addresses',
    pathParams: z.object({ id: z.string() }),
    body: z.object({ value: z.string().trim().min(1) }),
    responses: {
      200: MobileAddressSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      404: MobileUpstreamErrorSchema,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: 'Record a new address for one merchant, typed by the reviewer',
    metadata: requires('contacts.entities.write'),
  },
});
