import {
  activateMinimumProtocol,
  readMinimumProtocol,
  TYPE_TREE_PROTOCOL,
} from '../../protocol/rollout.js';
import { createCatalogueDraft, patchCatalogueDraft, publishCatalogueDraft } from '../authoring.js';

import type { CommandDb } from '../../domain/commands/entities.js';
import type { CatalogueDescriptor, DraftOperation } from '../authoring-types.js';
import type { DraftTarget } from '../authoring.js';

const AUTHOR = { kind: 'web', id: 'owner', label: 'Owner' } as const;

/** Stable ids for the published bedding type tree and its inherited definitions. */
export interface ItemTypeTreeCatalogue {
  readonly revision: number;
  readonly beddingTypeId: string;
  readonly linenTypeId: string;
  readonly sheetTypeId: string;
  readonly quiltCoverTypeId: string;
  readonly materialFieldId: string;
  readonly materialCottonOptionId: string;
  readonly brandFieldId: string;
  readonly labelFieldId: string;
  readonly partnerFieldId: string;
  readonly partnerBrandFieldId: string;
  readonly fittedFieldId: string;
  readonly closureFieldId: string;
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

function fieldId(draft: CatalogueDescriptor, typeIdValue: string, key: string): string {
  const field = draft.types
    .find((entry) => entry.id === typeIdValue)
    ?.fields.find((entry) => entry.key === key);
  if (field === undefined) throw new Error(`field ${key} was not created`);
  return field.id;
}

function field(
  typeIdValue: string,
  key: string,
  fieldKind: Extract<DraftOperation, { kind: 'put_field' }>['fieldKind'],
  extra: Omit<
    Extract<DraftOperation, { kind: 'put_field' }>,
    'kind' | 'typeId' | 'key' | 'label' | 'fieldKind'
  > = {}
): DraftOperation {
  return {
    kind: 'put_field',
    typeId: typeIdValue,
    key,
    label: key,
    fieldKind,
    cardinality: 'one',
    required: false,
    storage: 'stored',
    ...extra,
  };
}

interface TreeState {
  readonly draft: CatalogueDescriptor;
  readonly beddingTypeId: string;
  readonly linenTypeId: string;
  readonly sheetTypeId: string;
  readonly quiltCoverTypeId: string;
}

interface BeddingFieldState extends TreeState {
  readonly materialFieldId: string;
  readonly materialCottonOptionId: string;
  readonly brandFieldId: string;
  readonly labelFieldId: string;
  readonly partnerFieldId: string;
  readonly partnerBrandFieldId: string;
}

interface CompleteTreeState extends BeddingFieldState {
  readonly fittedFieldId: string;
  readonly closureFieldId: string;
}

function createTreeTypes(db: CommandDb, created: CatalogueDescriptor): TreeState {
  const beddingDraft = patchCatalogueDraft(db, target(created), [
    { kind: 'put_type', key: 'bedding', label: 'Bedding', capabilities: ['containment'] },
  ]).draft;
  const beddingTypeId = typeId(beddingDraft, 'bedding');
  const linenDraft = patchCatalogueDraft(db, target(beddingDraft), [
    { kind: 'put_type', key: 'linen', label: 'Linen', parentTypeId: beddingTypeId },
  ]).draft;
  const linenTypeId = typeId(linenDraft, 'linen');
  const sheetDraft = patchCatalogueDraft(db, target(linenDraft), [
    { kind: 'put_type', key: 'sheet', label: 'Sheet', parentTypeId: linenTypeId },
  ]).draft;
  const sheetTypeId = typeId(sheetDraft, 'sheet');
  const draft = patchCatalogueDraft(db, target(sheetDraft), [
    { kind: 'put_type', key: 'quilt_cover', label: 'Quilt cover', parentTypeId: linenTypeId },
  ]).draft;
  return {
    draft,
    beddingTypeId,
    linenTypeId,
    sheetTypeId,
    quiltCoverTypeId: typeId(draft, 'quilt_cover'),
  };
}

function addBeddingFields(db: CommandDb, tree: TreeState): BeddingFieldState {
  const withMaterial = patchCatalogueDraft(db, target(tree.draft), [
    field(tree.beddingTypeId, 'material', 'enum', { required: true }),
  ]).draft;
  const materialFieldId = fieldId(withMaterial, tree.beddingTypeId, 'material');
  const withMaterialOption = patchCatalogueDraft(db, target(withMaterial), [
    { kind: 'put_enum_option', fieldId: materialFieldId, key: 'cotton', label: 'Cotton' },
  ]).draft;
  const materialCottonOptionId = withMaterialOption.types
    .find((entry) => entry.id === tree.beddingTypeId)
    ?.fields.find((entry) => entry.id === materialFieldId)
    ?.enumOptions.find((entry) => entry.key === 'cotton')?.id;
  if (materialCottonOptionId === undefined) throw new Error('cotton option was not created');

  const withBrand = patchCatalogueDraft(db, target(withMaterialOption), [
    field(tree.beddingTypeId, 'brand', 'short_text'),
  ]).draft;
  const brandFieldId = fieldId(withBrand, tree.beddingTypeId, 'brand');
  const withLabel = patchCatalogueDraft(db, target(withBrand), [
    field(tree.beddingTypeId, 'label', 'short_text', {
      storage: 'computed',
      expressionVersion: 1,
      expression: {
        op: 'concat',
        left: { op: 'read', path: [], fieldId: brandFieldId },
        right: { op: 'literal', value: ' bedding' },
      },
    }),
  ]).draft;
  const labelFieldId = fieldId(withLabel, tree.beddingTypeId, 'label');
  const withPartner = patchCatalogueDraft(db, target(withLabel), [
    field(tree.beddingTypeId, 'partner', 'reference', {
      referenceKinds: ['item'],
      referenceTypeIds: [tree.beddingTypeId],
    }),
  ]).draft;
  const partnerFieldId = fieldId(withPartner, tree.beddingTypeId, 'partner');
  const draft = patchCatalogueDraft(db, target(withPartner), [
    field(tree.beddingTypeId, 'partner_brand', 'short_text', {
      storage: 'computed',
      expressionVersion: 1,
      expression: { op: 'read', path: [partnerFieldId], fieldId: brandFieldId },
    }),
  ]).draft;
  return {
    ...tree,
    draft,
    materialFieldId,
    materialCottonOptionId,
    brandFieldId,
    labelFieldId,
    partnerFieldId,
    partnerBrandFieldId: fieldId(draft, tree.beddingTypeId, 'partner_brand'),
  };
}

function addLeafFields(db: CommandDb, tree: BeddingFieldState): CompleteTreeState {
  const withFitted = patchCatalogueDraft(db, target(tree.draft), [
    field(tree.sheetTypeId, 'fitted', 'boolean'),
  ]).draft;
  const fittedFieldId = fieldId(withFitted, tree.sheetTypeId, 'fitted');
  const draft = patchCatalogueDraft(db, target(withFitted), [
    field(tree.quiltCoverTypeId, 'closure', 'short_text'),
  ]).draft;
  return {
    ...tree,
    draft,
    fittedFieldId,
    closureFieldId: fieldId(draft, tree.quiltCoverTypeId, 'closure'),
  };
}

/** Publishes the bedding → linen → sheet/quilt-cover tree used by type-tree tests. */
export function publishItemTypeTree(db: CommandDb): ItemTypeTreeCatalogue {
  activateMinimumProtocol(db, readMinimumProtocol(db), TYPE_TREE_PROTOCOL);
  const created = createCatalogueDraft(db, 1, AUTHOR);
  const revision = created.revision.revision;
  const complete = addLeafFields(db, addBeddingFields(db, createTreeTypes(db, created)));
  const { draft, ...ids } = complete;

  publishCatalogueDraft(
    db,
    revision,
    { baseRevision: 1, expectedDraftVersion: draft.revision.draftVersion, note: null },
    AUTHOR
  );
  return {
    revision,
    ...ids,
  };
}
