import { z } from 'zod';

/** What part of the catalogue a {@link CatalogueChange} is about. */
export type CatalogueChangeDefinition = 'type' | 'field' | 'option' | 'revision';

/**
 * What happened to a definition between the revision a change was authored
 * against and the active one. `revision` definitions are only ever
 * `not_in_revision` (the server has no such revision) or `needs_newer_app`
 * (the newer revision raised its minimum protocol).
 */
export type CatalogueChangeKind =
  | 'archived'
  | 'replaced'
  | 'retired'
  | 'now_required'
  | 'not_in_revision'
  | 'redefined'
  | 'needs_newer_app';

/**
 * Why a `catalogue_update_required` or `catalogue_repair_required` outcome
 * refused a mutation, one definition at a time. `definition` and `change` are
 * closed here and open strings on the wire, as `reason` is, so a new kind
 * cannot break an installed app.
 */
export interface CatalogueChange {
  readonly definition: CatalogueChangeDefinition;
  /** The definition's stable id, or the revision number for a `revision`. */
  readonly id: string;
  /** The type the field or option belongs to, and a type's own id. */
  readonly typeId: string | null;
  /** The field an option belongs to, and a field's own id. */
  readonly fieldId: string | null;
  readonly change: CatalogueChangeKind;
  /** The definition that replaced this one, when the catalogue records one. */
  readonly replacementId: string | null;
  /** The published revision the change first appeared in. */
  readonly revision: number;
}

/** {@link CatalogueChange} as the sync contract declares it. */
export const catalogueChangeWireSchema = z.object({
  definition: z.string(),
  id: z.string(),
  typeId: z.string().nullable(),
  fieldId: z.string().nullable(),
  change: z.string(),
  replacementId: z.string().nullable(),
  revision: z.number().int(),
});
