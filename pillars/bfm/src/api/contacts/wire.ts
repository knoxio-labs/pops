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
