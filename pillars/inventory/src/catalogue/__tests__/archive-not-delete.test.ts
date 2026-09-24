/**
 * POPS-4356: the authoring API has no delete operation by construction
 * (`DraftOperation` is a closed union with only `put_*`, `archive_*` and
 * `reorder` kinds). These tests exercise the other half of that design: an
 * archived type, field or enum option is never removed from the persisted
 * snapshot, and an item that already holds a value for a field keeps reading
 * it after that field is archived.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { openMigratedTestDb } from '../../db/__tests__/migrated-db.js';
import { itemFieldValues, items } from '../../db/schema.js';
import { createCatalogueDraft, patchCatalogueDraft, publishCatalogueDraft } from '../authoring.js';
import { loadPublishedCatalogue } from '../catalogue.js';
import { readItemFieldValues } from '../item-values.js';

import type { InventoryDb } from '../../db/index.js';
import type { CatalogueAuthor, CatalogueDescriptor } from '../authoring-types.js';

const AUTHOR: CatalogueAuthor = { kind: 'web', id: 'owner', label: 'Owner' };

let db: InventoryDb;

beforeEach(() => {
  db = openMigratedTestDb().db;
});

function typeId(draft: CatalogueDescriptor, key: string): string {
  const type = draft.types.find((entry) => entry.key === key);
  if (!type) throw new Error(`type ${key} not found in draft`);
  return type.id;
}

function fieldId(draft: CatalogueDescriptor, typeKey: string, fieldKey: string): string {
  const type = draft.types.find((entry) => entry.key === typeKey);
  const field = type?.fields.find((entry) => entry.key === fieldKey);
  if (!field) throw new Error(`field ${typeKey}.${fieldKey} not found in draft`);
  return field.id;
}

function optionId(
  draft: CatalogueDescriptor,
  typeKey: string,
  fieldKey: string,
  optionKey: string
): string {
  const type = draft.types.find((entry) => entry.key === typeKey);
  const field = type?.fields.find((entry) => entry.key === fieldKey);
  const option = field?.enumOptions.find((entry) => entry.key === optionKey);
  if (!option) throw new Error(`option ${typeKey}.${fieldKey}.${optionKey} not found in draft`);
  return option.id;
}

describe('archiving through the authoring API', () => {
  it('leaves the type, field and enum option present with archivedAt set after publication', () => {
    const current = loadPublishedCatalogue(db);
    if (!current) throw new Error('no published catalogue');
    const baseRevision = current.revision.revision;

    const created = createCatalogueDraft(db, baseRevision, AUTHOR);
    const draftRevision = created.revision.revision;

    const withType = patchCatalogueDraft(
      db,
      {
        revision: draftRevision,
        baseRevision,
        expectedDraftVersion: created.revision.draftVersion,
      },
      [{ kind: 'put_type', key: 'archive_probe', label: 'Archive probe' }]
    );
    const probeTypeId = typeId(withType.draft, 'archive_probe');

    const withField = patchCatalogueDraft(
      db,
      {
        revision: draftRevision,
        baseRevision,
        expectedDraftVersion: withType.draft.revision.draftVersion,
      },
      [
        {
          kind: 'put_field',
          typeId: probeTypeId,
          key: 'State',
          label: 'State',
          fieldKind: 'enum',
          cardinality: 'one',
          storage: 'stored',
        },
      ]
    );
    const probeFieldId = fieldId(withField.draft, 'archive_probe', 'State');

    const withOption = patchCatalogueDraft(
      db,
      {
        revision: draftRevision,
        baseRevision,
        expectedDraftVersion: withField.draft.revision.draftVersion,
      },
      [{ kind: 'put_enum_option', fieldId: probeFieldId, key: 'ready', label: 'Ready' }]
    );
    const probeOptionId = optionId(withOption.draft, 'archive_probe', 'State', 'ready');

    const archived = patchCatalogueDraft(
      db,
      {
        revision: draftRevision,
        baseRevision,
        expectedDraftVersion: withOption.draft.revision.draftVersion,
      },
      [
        { kind: 'archive_type', id: probeTypeId },
        { kind: 'archive_field', id: probeFieldId },
        { kind: 'archive_enum_option', id: probeOptionId },
      ]
    );

    const published = publishCatalogueDraft(
      db,
      draftRevision,
      {
        baseRevision,
        expectedDraftVersion: archived.draft.revision.draftVersion,
        note: 'archive-not-delete test',
      },
      AUTHOR
    );

    const catalogue = loadPublishedCatalogue(db, published.revision.revision);
    if (!catalogue) throw new Error('publication did not persist a catalogue');
    const type = catalogue.types.find((entry) => entry.id === probeTypeId);
    if (!type) throw new Error('archived type was removed from the published catalogue');
    expect(type.archivedAt).not.toBeNull();

    const field = type.fields.find((entry) => entry.id === probeFieldId);
    if (!field) throw new Error('archived field was removed from the published catalogue');
    expect(field.archivedAt).not.toBeNull();

    const option = field.enumOptions.find((entry) => entry.id === probeOptionId);
    if (!option) throw new Error('archived enum option was removed from the published catalogue');
    expect(option.archivedAt).not.toBeNull();
  });
});

describe('items holding values of an archived field', () => {
  it('still read those values', () => {
    const current = loadPublishedCatalogue(db);
    if (!current) throw new Error('no published catalogue');
    const baseRevision = current.revision.revision;

    const created = createCatalogueDraft(db, baseRevision, AUTHOR);
    const draftRevision = created.revision.revision;

    const withType = patchCatalogueDraft(
      db,
      {
        revision: draftRevision,
        baseRevision,
        expectedDraftVersion: created.revision.draftVersion,
      },
      [{ kind: 'put_type', key: 'archived_field_probe', label: 'Archived field probe' }]
    );
    const probeTypeId = typeId(withType.draft, 'archived_field_probe');

    const withField = patchCatalogueDraft(
      db,
      {
        revision: draftRevision,
        baseRevision,
        expectedDraftVersion: withType.draft.revision.draftVersion,
      },
      [
        {
          kind: 'put_field',
          typeId: probeTypeId,
          key: 'Notes',
          label: 'Notes',
          fieldKind: 'short_text',
          cardinality: 'one',
          storage: 'stored',
        },
      ]
    );
    const probeFieldId = fieldId(withField.draft, 'archived_field_probe', 'Notes');

    const published = publishCatalogueDraft(
      db,
      draftRevision,
      {
        baseRevision,
        expectedDraftVersion: withField.draft.revision.draftVersion,
        note: 'seed field before archiving',
      },
      AUTHOR
    );
    const publishedRevision = published.revision.revision;

    const itemId = 'archived-field-probe-item';
    db.insert(items)
      .values({
        id: itemId,
        name: 'Probe item',
        placementKind: 'hand',
        typeId: probeTypeId,
        lastEditedTime: '2026-09-24T00:00:00.000Z',
        seq: 0,
      })
      .run();
    db.insert(itemFieldValues)
      .values({
        itemId,
        fieldId: probeFieldId,
        source: 'stored',
        ordinal: 0,
        valueJson: JSON.stringify('Kept even once archived'),
        catalogueRevision: publishedRevision,
        createdAt: '2026-09-24T00:00:00.000Z',
        updatedAt: '2026-09-24T00:00:00.000Z',
      })
      .run();

    const secondDraft = createCatalogueDraft(db, publishedRevision, AUTHOR);
    const secondDraftRevision = secondDraft.revision.revision;
    const archived = patchCatalogueDraft(
      db,
      {
        revision: secondDraftRevision,
        baseRevision: publishedRevision,
        expectedDraftVersion: secondDraft.revision.draftVersion,
      },
      [{ kind: 'archive_field', id: probeFieldId }]
    );
    publishCatalogueDraft(
      db,
      secondDraftRevision,
      {
        baseRevision: publishedRevision,
        expectedDraftVersion: archived.draft.revision.draftVersion,
        note: 'archive the field the item still uses',
      },
      AUTHOR
    );

    // The item's value is still pinned to the revision it was written
    // against; that historical row is immutable and was never touched by the
    // later archiving publication.
    const originalField = loadPublishedCatalogue(db, publishedRevision)
      ?.types.find((entry) => entry.id === probeTypeId)
      ?.fields.find((entry) => entry.id === probeFieldId);
    expect(originalField?.archivedAt).toBeNull();

    const values = readItemFieldValues(db, itemId);
    const notes = values.find((entry) => entry.fieldId === probeFieldId);
    expect(notes?.values).toEqual(['Kept even once archived']);

    // The field's identity is genuinely archived in the catalogue's current
    // (latest) revision -- confirming the read above worked without it.
    const latest = loadPublishedCatalogue(db);
    const currentField = latest?.types
      .find((entry) => entry.id === probeTypeId)
      ?.fields.find((entry) => entry.id === probeFieldId);
    expect(currentField?.archivedAt).not.toBeNull();
  });
});
