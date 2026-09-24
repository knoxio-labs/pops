/**
 * Publication enforces the protocol gate (Inventory ADR-002 D5/D10): vocabulary
 * the base catalogue never used raises the revision's minimum protocol, and the
 * revision cannot publish until the persisted rollout minimum reaches it.
 */
import { describe, expect, it } from 'vitest';

import { openMigratedTestDb } from '../../db/__tests__/migrated-db.js';
import { readMinimumProtocol } from '../../protocol/rollout.js';
import { currentPublished } from '../authoring-shared.js';
import {
  CatalogueApiError,
  createCatalogueDraft,
  patchCatalogueDraft,
  publishCatalogueDraft,
} from '../authoring.js';
import { activatePersistedCatalogueProtocol } from './protocol-rollout-fixture.js';

import type { DraftOperation } from '../authoring-types.js';

const AUTHOR = { kind: 'web', id: 'owner', label: 'Owner' } as const;

function draftWith(operation: (typeId: string) => DraftOperation) {
  const opened = openMigratedTestDb();
  const created = createCatalogueDraft(opened.db, 1, AUTHOR);
  const typeId = created.types[0]?.id;
  if (typeId === undefined) throw new Error('the bootstrap catalogue has no type');
  const patched = patchCatalogueDraft(
    opened.db,
    {
      revision: created.revision.revision,
      baseRevision: 1,
      expectedDraftVersion: created.revision.draftVersion,
    },
    [operation(typeId)]
  );
  const publish = () =>
    publishCatalogueDraft(
      opened.db,
      created.revision.revision,
      { baseRevision: 1, expectedDraftVersion: patched.draft.revision.draftVersion, note: null },
      AUTHOR
    );
  return { ...opened, patched, publish, revision: created.revision.revision };
}

function optionalField(fieldKind: 'date' | 'short_text') {
  return (typeId: string): DraftOperation => ({
    kind: 'put_field',
    typeId,
    key: 'checked_on',
    label: 'Checked on',
    fieldKind,
    cardinality: 'one',
    required: false,
    storage: 'stored',
  });
}

function publicationError(publish: () => unknown): CatalogueApiError {
  try {
    publish();
  } catch (error) {
    if (error instanceof CatalogueApiError) return error;
    throw error;
  }
  throw new Error('publication unexpectedly succeeded');
}

describe('the publication protocol gate', () => {
  it('refuses a new primitive kind while protocol 1 is the rollout minimum, and publishes nothing', () => {
    const { db, raw, patched, publish, revision } = draftWith(optionalField('date'));
    expect(patched.draft.revision.minimumProtocol).toBe(1);

    const error = publicationError(publish);

    expect(error).toMatchObject({ status: 409, code: 'protocol_rollout_required' });
    expect(error.message).toContain('Activate inventory protocol 2');
    expect(error.preview?.compatibility.classification).toBe('protocol_gated');
    expect(currentPublished(db).revision.revision).toBe(1);
    expect(
      raw
        .prepare(
          'SELECT status, minimum_protocol AS minimumProtocol FROM catalogue_revisions WHERE revision = ?'
        )
        .get(revision)
    ).toEqual({ status: 'draft', minimumProtocol: 1 });
  });

  it('publishes it once protocol 2 is active and records the raised minimum on the revision', () => {
    const { db, publish } = draftWith(optionalField('date'));
    activatePersistedCatalogueProtocol(db);

    const published = publish();

    expect(published.revision).toMatchObject({ status: 'published', minimumProtocol: 2 });
    expect(readMinimumProtocol(db)).toBe(2);
  });

  it('raises a minimum the publisher declared below the gated vocabulary', () => {
    const { db, patched, revision } = draftWith(optionalField('date'));
    activatePersistedCatalogueProtocol(db);

    const published = publishCatalogueDraft(
      db,
      revision,
      {
        baseRevision: 1,
        expectedDraftVersion: patched.draft.revision.draftVersion,
        minimumProtocol: 1,
        note: null,
      },
      AUTHOR
    );

    expect(published.revision.minimumProtocol).toBe(2);
  });

  it('leaves vocabulary the base already uses at protocol 1', () => {
    const { db, publish } = draftWith(optionalField('short_text'));

    const published = publish();

    expect(published.revision).toMatchObject({ status: 'published', minimumProtocol: 1 });
    expect(readMinimumProtocol(db)).toBe(1);
  });
});
