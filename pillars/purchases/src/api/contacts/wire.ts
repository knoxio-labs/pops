/**
 * The shape of the contacts entity list, validated at the boundary.
 *
 * Narrow on purpose: this pillar needs an id, a name and the aliases to
 * decide whether a receipt's trading name is a merchant it already knows,
 * and validating more would couple purchases to fields it never reads
 * (ADR-040). `aliases` defaults to empty rather than being required,
 * because a contact with none is not a contract violation.
 */
import { z } from 'zod';

export const ContactEntitySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    aliases: z.array(z.string()).default([]),
  })
  .passthrough();

export const EntityListResponseSchema = z.object({
  data: z.array(ContactEntitySchema),
});

export type ContactEntity = z.infer<typeof ContactEntitySchema>;
