/**
 * A type added by a draft is classified by its field kinds, so a new type
 * that introduces a primitive kind is protocol-gated in the draft preview and
 * in the compatibility proof publication records (Inventory ADR-002 D5).
 */
import { describe, expect, it } from 'vitest';

import { openMigratedTestDb } from '../../db/__tests__/migrated-db.js';
import { createCatalogueDraft, patchCatalogueDraft, publishCatalogueDraft } from '../authoring.js';
import { activatePersistedCatalogueProtocol } from './protocol-rollout-fixture.js';

import type { DraftOperation } from '../authoring-types.js';

const AUTHOR = { kind: 'web', id: 'owner', label: 'Owner' } as const;

function draftWithType(fieldKind: 'date_time' | 'short_text') {
  const { db, raw } = openMigratedTestDb();
  const created = createCatalogueDraft(db, 1, AUTHOR);
  const target = {
    revision: created.revision.revision,
    baseRevision: 1,
    expectedDraftVersion: created.revision.draftVersion,
  };
  const withType = patchCatalogueDraft(db, target, [
    { kind: 'put_type', key: 'appointment', label: 'Appointment' },
  ]).draft;
  const typeId = withType.types.find((entry) => entry.key === 'appointment')?.id;
  if (typeId === undefined) throw new Error('appointment was not created');
  const field: DraftOperation = {
    kind: 'put_field',
    typeId,
    key: 'when',
    label: 'When',
    fieldKind,
    cardinality: 'one',
    required: true,
    storage: 'stored',
  };
  const patched = patchCatalogueDraft(
    db,
    { ...target, expectedDraftVersion: withType.revision.draftVersion },
    [field]
  );
  const fieldId = patched.draft.types
    .find((entry) => entry.id === typeId)
    ?.fields.find((entry) => entry.key === 'when')?.id;
  if (fieldId === undefined) throw new Error('when was not created');
  return { db, raw, typeId, fieldId, patched, revision: created.revision.revision };
}

describe('publishing a new type that introduces a primitive kind', () => {
  it('previews the new type as protocol-gated on its field', () => {
    const { typeId, fieldId, patched } = draftWithType('date_time');

    expect(patched.compatibility.classification).toBe('protocol_gated');
    expect(patched.compatibility.changes).toEqual(
      expect.arrayContaining([
        { classification: 'compatible', definitionId: typeId, code: 'type_added' },
        { classification: 'protocol_gated', definitionId: fieldId, code: 'primitive_kind_added' },
      ])
    );
  });

  it('records the protocol gate in the compatibility proof it publishes', () => {
    const { db, raw, revision, patched } = draftWithType('date_time');
    activatePersistedCatalogueProtocol(db);

    publishCatalogueDraft(
      db,
      revision,
      { baseRevision: 1, expectedDraftVersion: patched.draft.revision.draftVersion, note: null },
      AUTHOR
    );

    expect(
      raw
        .prepare('SELECT classification FROM catalogue_compatibility WHERE to_revision = ?')
        .get(revision)
    ).toEqual({ classification: 'protocol_gated' });
  });

  it('leaves a new type that only uses existing kinds compatible', () => {
    const { patched } = draftWithType('short_text');

    expect(patched.compatibility.classification).toBe('compatible');
  });
});
