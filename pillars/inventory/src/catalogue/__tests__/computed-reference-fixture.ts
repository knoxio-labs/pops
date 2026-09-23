import { createCatalogueDraft, patchCatalogueDraft, publishCatalogueDraft } from '../authoring.js';

import type { CommandDb } from '../../domain/commands/entities.js';
import type { CatalogueDescriptor, DraftOperation } from '../authoring-types.js';
import type { DraftTarget } from '../authoring.js';

const AUTHOR = { kind: 'web', id: 'owner', label: 'Owner' } as const;

/**
 * Ids of a published catalogue whose computed fields read across items:
 * a `kit` reads its `part`'s weight, and a `bundle` reads the same weight two
 * references away and, separately, the kit's own computed weight.
 */
export interface ReferenceComputedCatalogue {
  readonly revision: number;
  readonly partTypeId: string;
  readonly weightFieldId: string;
  readonly kitTypeId: string;
  readonly kitPartFieldId: string;
  /** `kit.partWeight = part.weight * 2`. */
  readonly kitWeightFieldId: string;
  readonly bundleTypeId: string;
  readonly bundleKitFieldId: string;
  /** `bundle.twoHopWeight = kit.part.weight * 3`. */
  readonly twoHopFieldId: string;
  /** `bundle.viaKit = kit.partWeight + 1`, overridable. */
  readonly viaKitFieldId: string;
}

function target(draft: CatalogueDescriptor): DraftTarget {
  return {
    revision: draft.revision.revision,
    baseRevision: 1,
    expectedDraftVersion: draft.revision.draftVersion,
  };
}

function typeId(draft: CatalogueDescriptor, key: string): string {
  const type = draft.types.find((entry) => entry.key === key);
  if (type === undefined) throw new Error(`type ${key} was not created`);
  return type.id;
}

function fieldId(draft: CatalogueDescriptor, owner: string, key: string): string {
  const field = draft.types
    .find((entry) => entry.id === owner)
    ?.fields.find((entry) => entry.key === key);
  if (field === undefined) throw new Error(`field ${key} was not created`);
  return field.id;
}

function reference(owner: string, key: string, targetTypeId: string): DraftOperation {
  return {
    kind: 'put_field',
    typeId: owner,
    key,
    label: key,
    fieldKind: 'reference',
    cardinality: 'one',
    required: false,
    storage: 'stored',
    referenceKinds: ['item'],
    referenceTypeIds: [targetTypeId],
  };
}

function computed(
  owner: string,
  key: string,
  expression: unknown,
  allowOverride = false
): DraftOperation {
  return {
    kind: 'put_field',
    typeId: owner,
    key,
    label: key,
    fieldKind: 'integer',
    cardinality: 'one',
    required: false,
    storage: 'computed',
    expressionVersion: 1,
    expression,
    allowOverride,
  };
}

function weight(partTypeId: string): DraftOperation {
  return {
    kind: 'put_field',
    typeId: partTypeId,
    key: 'weight',
    label: 'Weight',
    fieldKind: 'integer',
    cardinality: 'one',
    required: false,
    storage: 'stored',
  };
}

function bundleFields(
  bundleTypeId: string,
  ids: {
    bundleKitFieldId: string;
    kitPartFieldId: string;
    weightFieldId: string;
    kitWeightFieldId: string;
  }
): DraftOperation[] {
  return [
    computed(bundleTypeId, 'twoHopWeight', {
      op: 'multiply',
      left: {
        op: 'read',
        path: [ids.bundleKitFieldId, ids.kitPartFieldId],
        fieldId: ids.weightFieldId,
      },
      right: { op: 'literal', value: 3 },
    }),
    computed(
      bundleTypeId,
      'viaKit',
      {
        op: 'add',
        left: { op: 'read', path: [ids.bundleKitFieldId], fieldId: ids.kitWeightFieldId },
        right: { op: 'literal', value: 1 },
      },
      true
    ),
  ];
}

/** Publishes {@link ReferenceComputedCatalogue} as the next catalogue revision. */
export function publishReferenceComputedTypes(db: CommandDb): ReferenceComputedCatalogue {
  const created = createCatalogueDraft(db, 1, AUTHOR);
  const revision = created.revision.revision;
  const withTypes = patchCatalogueDraft(db, target(created), [
    { kind: 'put_type', key: 'part', label: 'Part' },
    { kind: 'put_type', key: 'kit', label: 'Kit' },
    { kind: 'put_type', key: 'bundle', label: 'Bundle' },
  ]).draft;
  const partTypeId = typeId(withTypes, 'part');
  const kitTypeId = typeId(withTypes, 'kit');
  const bundleTypeId = typeId(withTypes, 'bundle');
  const withStored = patchCatalogueDraft(db, target(withTypes), [
    weight(partTypeId),
    reference(kitTypeId, 'part', partTypeId),
    reference(bundleTypeId, 'kit', kitTypeId),
  ]).draft;
  const weightFieldId = fieldId(withStored, partTypeId, 'weight');
  const kitPartFieldId = fieldId(withStored, kitTypeId, 'part');
  const bundleKitFieldId = fieldId(withStored, bundleTypeId, 'kit');
  const withKitWeight = patchCatalogueDraft(db, target(withStored), [
    computed(kitTypeId, 'partWeight', {
      op: 'multiply',
      left: { op: 'read', path: [kitPartFieldId], fieldId: weightFieldId },
      right: { op: 'literal', value: 2 },
    }),
  ]).draft;
  const kitWeightFieldId = fieldId(withKitWeight, kitTypeId, 'partWeight');
  const withBundle = patchCatalogueDraft(
    db,
    target(withKitWeight),
    bundleFields(bundleTypeId, {
      bundleKitFieldId,
      kitPartFieldId,
      weightFieldId,
      kitWeightFieldId,
    })
  ).draft;
  publishCatalogueDraft(
    db,
    revision,
    { baseRevision: 1, expectedDraftVersion: withBundle.revision.draftVersion, note: null },
    AUTHOR
  );
  return {
    revision,
    partTypeId,
    weightFieldId,
    kitTypeId,
    kitPartFieldId,
    kitWeightFieldId,
    bundleTypeId,
    bundleKitFieldId,
    twoHopFieldId: fieldId(withBundle, bundleTypeId, 'twoHopWeight'),
    viaKitFieldId: fieldId(withBundle, bundleTypeId, 'viaKit'),
  };
}
