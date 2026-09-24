import { CatalogueApiError } from './authoring-types.js';
import { toCatalogueDescriptor } from './authoring-wire.js';
import { loadCatalogue } from './catalogue.js';

import type { CommandDb } from '../domain/commands/entities.js';
import type { CatalogueRevisionWire, CatalogueTypeWire } from './authoring-types.js';

/** One type definition exactly as one immutable published catalogue revision defined it. */
export interface CatalogueTypeRevisionDescriptor {
  readonly revision: CatalogueRevisionWire;
  readonly type: CatalogueTypeWire;
}

/**
 * Reads the type with stable id `typeId` as published catalogue `revision`
 * (the current one when omitted) defined it, without writing anything.
 * Labels, archive state and fields are those of that snapshot, so an older
 * revision still shows a type's label before a rename or its fields before
 * an archive. Drafts and abandoned revisions are not readable here.
 *
 * Throws `404 catalogue_revision_unknown` when no such published revision
 * exists, and `404 catalogue_type_unknown` when that revision does not
 * define the type.
 */
export function readPublishedCatalogueType(
  db: CommandDb,
  typeId: string,
  revision?: number
): CatalogueTypeRevisionDescriptor {
  const catalogue = loadCatalogue(db, revision, ['published']);
  if (catalogue === null) {
    throw new CatalogueApiError(
      404,
      'catalogue_revision_unknown',
      `Catalogue revision ${revision ?? 'current'} was not found`
    );
  }
  const descriptor = toCatalogueDescriptor(db, catalogue);
  const type = descriptor.types.find((candidate) => candidate.id === typeId);
  if (type === undefined) {
    throw new CatalogueApiError(
      404,
      'catalogue_type_unknown',
      `Type ${typeId} is not defined in catalogue revision ${descriptor.revision.revision}`
    );
  }
  return { revision: descriptor.revision, type };
}
