/**
 * Publishes the catalogue the value vectors are written against. The type and
 * its fields are inserted into the draft at fixed ids (`patchCatalogueDraft`
 * only mints server-chosen ids, which would change every regeneration); the
 * publish itself runs through `publishCatalogueDraft`, so the rollout gate and
 * compatibility checks are the real ones.
 *
 * `gamma` is archived in a second revision after an item has selected it: the
 * value codec refuses a new selection of an archived option, so a retired
 * option on a live value can only be produced in that order.
 */
import {
  createCatalogueDraft,
  patchCatalogueDraft,
  publishCatalogueDraft,
  toCatalogueDescriptor,
} from '../../../catalogue/authoring.js';
import { loadCatalogue } from '../../../catalogue/catalogue.js';
import { PRIMITIVE_KINDS } from '../../../catalogue/value-types.js';
import {
  activateMinimumProtocol,
  PERSISTED_CATALOGUE_PROTOCOL,
  readMinimumProtocol,
} from '../../../protocol/rollout.js';
import {
  ENUM_MANY_OPTION_IDS,
  ENUM_ONE_OPTION_IDS,
  FIELD_IDS,
  fieldRows,
  insertEnumOptions,
  insertFields,
  insertType,
  TYPE_ID,
} from './catalogue-fields.js';
import { VALUE_VECTOR_CLOCK } from './fixture-engine.js';

import type { CatalogueDescriptor } from '../../../catalogue/authoring-types.js';
import type { CommandDb } from '../../../domain/commands/entities.js';
import type { EnumOptionIds } from './catalogue-fields.js';

export const VECTOR_AUTHOR = { kind: 'web', id: 'value-vector-fixture', label: 'Fixture' } as const;

export interface ValueVectorCatalogue {
  /** The revision every value is written against, with `gamma` still active. */
  readonly liveRevision: number;
  /** The revision after `gamma` is archived; equal to `liveRevision` until then. */
  readonly currentRevision: number;
  readonly typeId: string;
  readonly fieldIds: typeof FIELD_IDS;
  readonly enumOptionIds: EnumOptionIds;
  readonly enumManyOptionIds: EnumOptionIds;
}

/** Activates protocol 2 (every primitive kind is protocol-gated) and publishes the live revision. */
export function authorLiveValueVectorCatalogue(db: CommandDb): ValueVectorCatalogue {
  activateMinimumProtocol(db, readMinimumProtocol(db), PERSISTED_CATALOGUE_PROTOCOL);
  const created = createCatalogueDraft(db, 1, VECTOR_AUTHOR);
  const liveRevision = created.revision.revision;

  insertType(db, liveRevision);
  insertFields(db, liveRevision, fieldRows(PRIMITIVE_KINDS));
  insertEnumOptions(db, liveRevision);

  publishCatalogueDraft(
    db,
    liveRevision,
    { baseRevision: 1, expectedDraftVersion: created.revision.draftVersion, note: null },
    VECTOR_AUTHOR
  );

  return {
    liveRevision,
    currentRevision: liveRevision,
    typeId: TYPE_ID,
    fieldIds: FIELD_IDS,
    enumOptionIds: ENUM_ONE_OPTION_IDS,
    enumManyOptionIds: ENUM_MANY_OPTION_IDS,
  };
}

/** Archives `enumOne`'s `gamma` option in a new published revision. */
export function retireEnumOptionGamma(
  db: CommandDb,
  catalogue: ValueVectorCatalogue
): ValueVectorCatalogue {
  const draft = createCatalogueDraft(db, catalogue.liveRevision, VECTOR_AUTHOR);
  const currentRevision = draft.revision.revision;
  const patched = patchCatalogueDraft(
    db,
    {
      revision: currentRevision,
      baseRevision: catalogue.liveRevision,
      expectedDraftVersion: draft.revision.draftVersion,
    },
    [
      {
        kind: 'put_enum_option',
        id: catalogue.enumOptionIds.gamma,
        fieldId: catalogue.fieldIds.enumOne,
        archivedAt: '2026-09-20T00:00:00.000Z',
      },
    ]
  ).draft;
  publishCatalogueDraft(
    db,
    currentRevision,
    {
      baseRevision: catalogue.liveRevision,
      expectedDraftVersion: patched.revision.draftVersion,
      note: null,
    },
    VECTOR_AUTHOR
  );
  return { ...catalogue, currentRevision };
}

/**
 * The published revision as the type-catalogue read route serves it, with
 * the wall-clock stamps authoring writes replaced by the fixture clock so
 * regeneration is byte-identical.
 */
export function catalogueDescriptor(db: CommandDb, revision: number): CatalogueDescriptor {
  const catalogue = loadCatalogue(db, revision, ['published']);
  if (catalogue === null)
    throw new Error(`catalogue revision ${String(revision)} is not published`);
  const descriptor = toCatalogueDescriptor(db, catalogue);
  const { created, published } = descriptor.revision;
  return {
    ...descriptor,
    revision: {
      ...descriptor.revision,
      created: { ...created, at: VALUE_VECTOR_CLOCK },
      published: published === null ? null : { ...published, at: VALUE_VECTOR_CLOCK },
    },
  };
}
