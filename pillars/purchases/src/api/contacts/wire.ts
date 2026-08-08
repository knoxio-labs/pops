/**
 * The shape of the contacts entity list, validated at the boundary.
 *
 * Narrow on purpose: this pillar needs an id and a name to decide whether a
 * receipt's trading name is a merchant it already knows, and validating
 * more would couple purchases to fields it never reads (ADR-040).
 */
import { z } from 'zod';

export const ContactEntitySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
  })
  .passthrough();

export const EntityListResponseSchema = z.object({
  data: z.array(ContactEntitySchema),
});

export type ContactEntity = z.infer<typeof ContactEntitySchema>;
