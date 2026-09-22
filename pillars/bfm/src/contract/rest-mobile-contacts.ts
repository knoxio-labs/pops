/**
 * The phone's view of `contacts`: a merchant's recorded addresses (ADR-053).
 *
 * Exists so the receipt review screen's address picker has something to read
 * from and write to — "this merchant's addresses" only means something once
 * a route can answer it. Two capabilities, on the same reasoning
 * `purchases.read`/`purchases.write` are split: reading what is already
 * recorded and adding a new branch are different authorities.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { requires } from './capabilities.js';
import {
  MOBILE_PERIMETER_RESPONSES,
  MOBILE_REQUEST_RESPONSES,
  MOBILE_UPSTREAM_RESPONSES,
} from './rest-mobile-responses.js';
import {
  MobileAddressListSchema,
  MobileAddressSchema,
  MobileUpstreamErrorSchema,
} from './rest-schemas.js';

const c = initContract();

export const mobileContactsContract = c.router({
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
