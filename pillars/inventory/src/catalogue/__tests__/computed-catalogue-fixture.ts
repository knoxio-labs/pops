import { createCatalogueDraft, patchCatalogueDraft, publishCatalogueDraft } from '../authoring.js';
import { activatePersistedCatalogueProtocol } from './protocol-rollout-fixture.js';

import type { CommandDb } from '../../domain/commands/entities.js';
import type { CatalogueDescriptor, DraftOperation } from '../authoring-types.js';
import type { DraftTarget } from '../authoring.js';

const AUTHOR = { kind: 'web', id: 'owner', label: 'Owner' } as const;

/** Ids of the published computed test type and its fields. */
export interface ComputedCatalogue {
  readonly revision: number;
  readonly typeId: string;
  readonly inputFieldId: string;
  readonly computedFieldId: string;
  readonly lockedFieldId: string;
}

function computedField(
  typeId: string,
  key: string,
  inputFieldId: string,
  allowOverride: boolean
): DraftOperation {
  return {
    kind: 'put_field',
    typeId,
    key,
    label: key,
    fieldKind: 'integer',
    cardinality: 'one',
    required: allowOverride,
    storage: 'computed',
    expressionVersion: 1,
    expression: {
      op: 'multiply',
      left: { op: 'read', path: [], fieldId: inputFieldId },
      right: { op: 'literal', value: 2 },
    },
    allowOverride,
  };
}

function draftTarget(draft: CatalogueDescriptor): DraftTarget {
  return {
    revision: draft.revision.revision,
    baseRevision: 1,
    expectedDraftVersion: draft.revision.draftVersion,
  };
}

function fieldId(
  draft: ReturnType<typeof patchCatalogueDraft>['draft'],
  typeId: string,
  key: string
): string {
  const field = draft.types
    .find((entry) => entry.id === typeId)
    ?.fields.find((entry) => entry.key === key);
  if (field === undefined) throw new Error(`field ${key} was not created`);
  return field.id;
}

/**
 * Publishes a type with a required integer `input`, an overridable
 * `computed = input * 2` and a non-overridable `locked = input * 2`, after
 * activating the protocol its integer fields need.
 */
export function publishComputedType(db: CommandDb): ComputedCatalogue {
  activatePersistedCatalogueProtocol(db);
  const created = createCatalogueDraft(db, 1, AUTHOR);
  const revision = created.revision.revision;
  const withType = patchCatalogueDraft(db, draftTarget(created), [
    { kind: 'put_type', key: 'computed_device', label: 'Computed device' },
  ]);
  const type = withType.draft.types.find((entry) => entry.key === 'computed_device');
  if (type === undefined) throw new Error('computed type was not created');
  const withInput = patchCatalogueDraft(db, draftTarget(withType.draft), [
    {
      kind: 'put_field',
      typeId: type.id,
      key: 'input',
      label: 'Input',
      fieldKind: 'integer',
      cardinality: 'one',
      required: true,
      storage: 'stored',
    },
  ]);
  const inputFieldId = fieldId(withInput.draft, type.id, 'input');
  const withComputed = patchCatalogueDraft(db, draftTarget(withInput.draft), [
    computedField(type.id, 'computed', inputFieldId, true),
    computedField(type.id, 'locked', inputFieldId, false),
  ]);
  publishCatalogueDraft(
    db,
    revision,
    { baseRevision: 1, expectedDraftVersion: withComputed.draft.revision.draftVersion, note: null },
    AUTHOR
  );
  return {
    revision,
    typeId: type.id,
    inputFieldId,
    computedFieldId: fieldId(withComputed.draft, type.id, 'computed'),
    lockedFieldId: fieldId(withComputed.draft, type.id, 'locked'),
  };
}
