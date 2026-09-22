/**
 * The shape bfm reads from `contacts`' bulk entity lookup — scoped to
 * exactly the two fields merchant-identity resolution needs.
 *
 * `contacts` answers `id`, `name` and `aliases` per entity; `aliases` is
 * dropped at the boundary because nothing here matches against it — that
 * matching already happened, in `purchases`, when `merchantEntityId` was
 * written.
 */
import { z } from 'zod';

export const ContactsEntityLookupSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const ContactsLookupResponseSchema = z.object({
  entities: z.array(ContactsEntityLookupSchema),
});

export type ContactsEntityLookup = z.infer<typeof ContactsEntityLookupSchema>;

/** One address as contacts' `entities.addresses.list`/`.create` answer it (ADR-053). */
export const ContactsAddressSchema = z.object({
  id: z.string(),
  value: z.string(),
});

export type ContactsAddress = z.infer<typeof ContactsAddressSchema>;

export const ContactsAddressListResponseSchema = z.object({
  data: z.array(ContactsAddressSchema),
});

export const ContactsAddressMutationResponseSchema = z.object({
  data: ContactsAddressSchema,
});

/**
 * The subset of `contacts`' `Entity` the merchant search/get/create routes
 * need — matches {@link ContactsEntityLookupSchema}'s two fields, kept as its
 * own schema rather than reused because the two answer different producer
 * routes (`entities.list`/`.get`/`.create` vs `entities.lookup`) that happen
 * to share a shape today; a divergence in either is not this file's problem
 * to prevent.
 */
export const ContactsMerchantSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type ContactsMerchant = z.infer<typeof ContactsMerchantSchema>;

/** `GET /entities?search=` — `EntityListResponse` on the producer's side. */
export const ContactsMerchantListResponseSchema = z.object({
  data: z.array(ContactsMerchantSchema),
});

/** `GET /entities/:id` — `EntityResponse` on the producer's side. */
export const ContactsMerchantGetResponseSchema = z.object({
  data: ContactsMerchantSchema,
});

/** `POST /entities` — `EntityMutation` on the producer's side. */
export const ContactsMerchantMutationResponseSchema = z.object({
  data: ContactsMerchantSchema,
});
