import { z } from 'zod';

import { isOk, pillar } from '@pops/pillar-sdk/server';

import { ContactUriSchema } from '../../contract/contact-reference.js';

import type { CallResult } from '@pops/pillar-sdk/server';

const contactPrefix = 'pops:contacts/contact/';
const Reference = z
  .object({ canonicalId: z.string().min(1), uri: ContactUriSchema })
  .refine((reference) => reference.uri.slice(contactPrefix.length) === reference.canonicalId);
type ContactsRouter = {
  entities: { reference: (input: { id: string }) => Promise<CallResult<unknown>> };
};

/** Resolve to an owner-issued canonical URI; null means unknown, undefined means unverifiable. */
export type ContactReferenceResolver = (uri: string) => Promise<string | null | undefined>;

/** Read the published Contacts owner route through authenticated discovery, preserving canonical opaque IDs. */
export async function resolveContactReference(
  uri: string,
  read: (id: string) => Promise<CallResult<unknown>> = (id) =>
    pillar<ContactsRouter>('contacts').entities.reference({ id })
): Promise<string | null | undefined> {
  const parsed = ContactUriSchema.safeParse(uri);
  if (!parsed.success) return undefined;
  try {
    const result = await read(parsed.data.slice(contactPrefix.length));
    if (!isOk(result)) return result.kind === 'not-found' ? null : undefined;
    const reference = Reference.safeParse(result.value);
    return reference.success ? reference.data.uri : undefined;
  } catch {
    return undefined;
  }
}
