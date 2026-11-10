import { z } from 'zod';

/** Contacts-owned URI with a verbatim opaque identity; shape alone is not issuance proof. */
export const ContactUriSchema = z
  .string()
  .regex(/^pops:contacts\/contact\/[^/\s]+$/u, 'Expected a Contacts-issued contact reference');
