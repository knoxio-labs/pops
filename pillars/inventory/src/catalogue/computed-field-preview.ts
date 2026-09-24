import { eq } from 'drizzle-orm';

import { items } from '../db/schema.js';
import { applyDraftOperations } from './authoring-draft-operations.js';
import { requireCatalogue } from './authoring-shared.js';
import { CatalogueApiError } from './authoring-types.js';
import { namedItems, orderedItemIds, previewResult } from './computed-field-preview-result.js';
import { EffectiveValueReader } from './effective-item-values.js';
import { readItemFieldValues } from './item-values.js';

import type { CommandDb } from '../domain/commands/index.js';
import type { DraftTarget } from './authoring-draft-operations.js';
import type { DraftOperation } from './authoring-types.js';
import type { PersistedItemTypeField } from './catalogue-types.js';
import type {
  ComputedFieldPreview,
  ComputedFieldPreviewResult,
  ComputedFieldPreviewSubject,
} from './computed-field-preview-types.js';

/** What a preview answer traces its evaluation back to: a draft, or the published catalogue. */
export interface PreviewProvenance {
  readonly baseRevision: number;
  readonly draftRevision: number | null;
  readonly draftVersion: number | null;
}

/** Thrown to unwind a preview transaction that must never commit. */
export class PreviewRollback extends Error {
  constructor(readonly preview: ComputedFieldPreview) {
    super('Rollback non-mutating computed-field preview');
  }
}

/** Resolves the computed field a preview names, on the catalogue at `revision`. */
export function previewField(
  db: CommandDb,
  revision: number,
  subject: ComputedFieldPreviewSubject
): PersistedItemTypeField {
  const draft = requireCatalogue(db, revision, ['draft']);
  const type = draft.types.find((candidate) => candidate.id === subject.typeId);
  if (type === undefined)
    throw new CatalogueApiError(
      404,
      'preview_type_unknown',
      `Type ${subject.typeId} is not in the draft`
    );
  const field = type.fields.find((candidate) =>
    'id' in subject.field ? candidate.id === subject.field.id : candidate.key === subject.field.key
  );
  if (field === undefined)
    throw new CatalogueApiError(
      404,
      'preview_field_unknown',
      `Field ${'id' in subject.field ? subject.field.id : subject.field.key} is not on type ${type.id}`
    );
  if (field.storage !== 'computed')
    throw new CatalogueApiError(
      400,
      'preview_field_not_computed',
      `${field.label} is not computed`
    );
  return field;
}

/** Confirms `subject.itemId` exists and is an item of `subject.typeId`. */
export function previewItemType(db: CommandDb, subject: ComputedFieldPreviewSubject): void {
  const row = db
    .select({ typeId: items.typeId })
    .from(items)
    .where(eq(items.id, subject.itemId))
    .get();
  if (row === undefined)
    throw new CatalogueApiError(
      404,
      'preview_item_unknown',
      `Item ${subject.itemId} was not found`
    );
  if (row.typeId !== subject.typeId)
    throw new CatalogueApiError(
      400,
      'preview_item_type_mismatch',
      `Item ${subject.itemId} is not a ${subject.typeId} item`
    );
}

/** Evaluates a computed field on one item within a `draft`-status revision. */
export function evaluateOn(
  db: CommandDb,
  catalogueRevision: number,
  subject: ComputedFieldPreviewSubject
): { readonly field: PersistedItemTypeField; readonly result: ComputedFieldPreviewResult } {
  const field = previewField(db, catalogueRevision, subject);
  previewItemType(db, subject);
  const catalogue = requireCatalogue(db, catalogueRevision, ['draft']);
  const evaluation = new EffectiveValueReader(db, catalogue, null).evaluate(
    subject.itemId,
    field.id
  );
  if (evaluation === null) throw new Error(`computed field ${field.id} was not evaluated`);
  return { field, result: previewResult(subject.itemId, evaluation) };
}

/** Assembles the wire preview answer from its provenance and evaluated outcome. */
export function previewOutcome(
  db: CommandDb,
  provenance: PreviewProvenance,
  subject: ComputedFieldPreviewSubject,
  evaluation: {
    readonly field: PersistedItemTypeField;
    readonly result: ComputedFieldPreviewResult;
  }
): ComputedFieldPreview {
  const { field, result } = evaluation;
  const override = readItemFieldValues(db, subject.itemId).find(
    (entry) => entry.fieldId === field.id && entry.source === 'override'
  )?.values[0];
  const ids = orderedItemIds(subject.itemId, result.traversedItemIds, result.dependencies);
  return {
    ...provenance,
    typeId: subject.typeId,
    fieldId: field.id,
    itemId: subject.itemId,
    result,
    override: override ?? null,
    items: namedItems(db, ids),
  };
}

function evaluateInDraft(
  db: CommandDb,
  target: DraftTarget,
  operations: readonly DraftOperation[],
  subject: ComputedFieldPreviewSubject
): ComputedFieldPreview {
  applyDraftOperations(db, target, operations);
  const evaluation = evaluateOn(db, target.revision, subject);
  return previewOutcome(
    db,
    {
      baseRevision: target.baseRevision,
      draftRevision: target.revision,
      draftVersion: target.expectedDraftVersion,
    },
    subject,
    evaluation
  );
}

/**
 * Evaluates a draft computed field's expression on one item, with optional
 * unsaved operations applied first, and rolls every write back: the draft,
 * its version, the item and any override are left exactly as they were. The
 * draft version is checked like any draft call, so a stale editor is refused
 * with `catalogue_draft_conflict`; operations that leave the draft invalid
 * are refused with the same issue paths a save would return.
 */
export function previewComputedField(
  db: CommandDb,
  target: DraftTarget,
  operations: readonly DraftOperation[],
  subject: ComputedFieldPreviewSubject
): ComputedFieldPreview {
  try {
    db.transaction((tx) => {
      throw new PreviewRollback(evaluateInDraft(tx, target, operations, subject));
    });
  } catch (error) {
    if (error instanceof PreviewRollback) return error.preview;
    throw error;
  }
  throw new Error('Computed-field preview transaction completed without rolling back');
}
