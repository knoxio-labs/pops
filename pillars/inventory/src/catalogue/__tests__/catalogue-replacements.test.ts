/**
 * Replacement lineage authoring (POPS-4494 decision 3): archiving a type or
 * field may name the live definition that takes over from it, and that
 * lineage is validated, persisted, projected and carried into later drafts.
 */
import { describe, expect, it } from 'vitest';

import { openMigratedTestDb } from '../../db/__tests__/migrated-db.js';
import { CatalogueApiError } from '../authoring-types.js';
import { createCatalogueDraft, patchCatalogueDraft, publishCatalogueDraft } from '../authoring.js';
import { replacingField } from '../catalogue-lineage.js';
import { loadPublishedCatalogue } from '../catalogue.js';

import type { CommandDb } from '../../domain/commands/index.js';
import type { CatalogueDescriptor, DraftOperation } from '../authoring-types.js';
import type { DraftTarget } from '../authoring.js';

const AUTHOR = { kind: 'web', id: 'owner', label: 'Owner' } as const;
const STORED = { cardinality: 'one', required: false, storage: 'stored' } as const;

interface Session {
  readonly db: CommandDb;
  target: DraftTarget;
  draft: CatalogueDescriptor;
}

function open(): Session {
  const { db } = openMigratedTestDb();
  return start(db, 1);
}

function start(db: CommandDb, baseRevision: number): Session {
  const draft = createCatalogueDraft(db, baseRevision, AUTHOR);
  return {
    db,
    draft,
    target: {
      revision: draft.revision.revision,
      baseRevision,
      expectedDraftVersion: draft.revision.draftVersion,
    },
  };
}

function patch(session: Session, operations: DraftOperation[]): CatalogueDescriptor {
  const { draft } = patchCatalogueDraft(session.db, session.target, operations);
  session.draft = draft;
  session.target = { ...session.target, expectedDraftVersion: draft.revision.draftVersion };
  return draft;
}

function publish(session: Session): number {
  publishCatalogueDraft(
    session.db,
    session.target.revision,
    {
      baseRevision: session.target.baseRevision,
      expectedDraftVersion: session.target.expectedDraftVersion,
      note: null,
    },
    AUTHOR
  );
  return session.target.revision;
}

function typeId(draft: CatalogueDescriptor, key: string): string {
  const found = draft.types.find((type) => type.key === key);
  if (found === undefined) throw new Error(`no type ${key}`);
  return found.id;
}

function fieldId(draft: CatalogueDescriptor, key: string): string {
  const found = draft.types.flatMap((type) => type.fields).find((field) => field.key === key);
  if (found === undefined) throw new Error(`no field ${key}`);
  return found.id;
}

function field(draft: CatalogueDescriptor, id: string) {
  return draft.types.flatMap((type) => type.fields).find((entry) => entry.id === id);
}

/** A draft with types `lamp` and `light`, each with a `lumens` and a `brightness` text field. */
function seeded(): Session {
  const session = open();
  patch(session, [
    { kind: 'put_type', key: 'lamp', label: 'Lamp' },
    { kind: 'put_type', key: 'light', label: 'Light' },
  ]);
  const lamp = typeId(session.draft, 'lamp');
  const light = typeId(session.draft, 'light');
  patch(session, [
    {
      kind: 'put_field',
      typeId: lamp,
      key: 'lumens',
      label: 'Lumens',
      fieldKind: 'short_text',
      ...STORED,
    },
    {
      kind: 'put_field',
      typeId: lamp,
      key: 'brightness',
      label: 'Brightness',
      fieldKind: 'short_text',
      ...STORED,
    },
    {
      kind: 'put_field',
      typeId: light,
      key: 'light_lumens',
      label: 'Lumens',
      fieldKind: 'short_text',
      ...STORED,
    },
  ]);
  return session;
}

function issueCodes(run: () => unknown): string[] {
  try {
    run();
  } catch (error) {
    if (error instanceof CatalogueApiError) return error.issues.map((entry) => entry.code);
    throw error;
  }
  throw new Error('expected the patch to be refused');
}

describe('replacement lineage authoring', () => {
  it('records the replacement on the archived field, projects it and carries it forward', () => {
    const session = seeded();
    const lumens = fieldId(session.draft, 'lumens');
    const brightness = fieldId(session.draft, 'brightness');

    patch(session, [{ kind: 'archive_field', id: lumens, replacedBy: brightness }]);
    const published = publish(session);
    const next = start(session.db, published);

    expect(field(session.draft, lumens)).toMatchObject({
      archivedAt: expect.any(String),
      replacedBy: brightness,
    });
    expect(field(session.draft, brightness)).toMatchObject({ archivedAt: null, replacedBy: null });
    expect(field(next.draft, lumens)?.replacedBy).toBe(brightness);
    const catalogue = loadPublishedCatalogue(session.db, published);
    expect(catalogue && replacingField(catalogue, lumens)?.id).toBe(brightness);
  });

  it('records lineage on a field archived earlier without moving its archive time', () => {
    const session = seeded();
    const lumens = fieldId(session.draft, 'lumens');
    const brightness = fieldId(session.draft, 'brightness');
    patch(session, [{ kind: 'archive_field', id: lumens }]);
    const archivedAt = field(session.draft, lumens)?.archivedAt;
    const next = start(session.db, publish(session));

    patch(next, [{ kind: 'archive_field', id: lumens, replacedBy: brightness }]);

    expect(archivedAt).toEqual(expect.any(String));
    expect(field(next.draft, lumens)).toMatchObject({ archivedAt, replacedBy: brightness });
  });

  it('refuses a replacement that is not in the draft', () => {
    const session = seeded();
    const lumens = fieldId(session.draft, 'lumens');
    const lamp = typeId(session.draft, 'lamp');

    expect(
      issueCodes(() => patch(session, [{ kind: 'archive_field', id: lumens, replacedBy: lamp }]))
    ).toEqual(['replacement_unknown']);
  });

  it('refuses a replacement that is itself archived', () => {
    const session = seeded();
    const lumens = fieldId(session.draft, 'lumens');
    const brightness = fieldId(session.draft, 'brightness');

    expect(
      issueCodes(() =>
        patch(session, [
          { kind: 'archive_field', id: brightness },
          { kind: 'archive_field', id: lumens, replacedBy: brightness },
        ])
      )
    ).toEqual(['replacement_archived']);
  });

  it('refuses a definition replacing itself, directly or through a cycle', () => {
    const session = seeded();
    const lamp = typeId(session.draft, 'lamp');
    const light = typeId(session.draft, 'light');

    expect(
      issueCodes(() => patch(session, [{ kind: 'archive_type', id: lamp, replacedBy: lamp }]))
    ).toEqual(['replacement_self']);
    expect(
      issueCodes(() =>
        patch(session, [
          { kind: 'archive_type', id: lamp, replacedBy: light },
          { kind: 'archive_type', id: light, replacedBy: lamp },
        ])
      )
    ).toEqual(['replacement_cycle', 'replacement_cycle']);
  });

  it('refuses a replacement field on another type, unless that type replaces its own', () => {
    const session = seeded();
    const lamp = typeId(session.draft, 'lamp');
    const light = typeId(session.draft, 'light');
    const lumens = fieldId(session.draft, 'lumens');
    const lightLumens = fieldId(session.draft, 'light_lumens');

    expect(
      issueCodes(() =>
        patch(session, [{ kind: 'archive_field', id: lumens, replacedBy: lightLumens }])
      )
    ).toEqual(['replacement_type_mismatch']);
    patch(session, [
      { kind: 'archive_type', id: lamp, replacedBy: light },
      { kind: 'archive_field', id: lumens, replacedBy: lightLumens },
    ]);
    expect(field(session.draft, lumens)?.replacedBy).toBe(lightLumens);
  });

  it('never changes published lineage, and keeps a replaced definition archived', () => {
    const session = seeded();
    const lamp = typeId(session.draft, 'lamp');
    const lumens = fieldId(session.draft, 'lumens');
    const brightness = fieldId(session.draft, 'brightness');
    patch(session, [
      {
        kind: 'put_field',
        typeId: lamp,
        key: 'glow',
        label: 'Glow',
        fieldKind: 'short_text',
        ...STORED,
      },
    ]);
    const glow = fieldId(session.draft, 'glow');
    patch(session, [{ kind: 'archive_field', id: lumens, replacedBy: brightness }]);
    const next = start(session.db, publish(session));

    expect(
      issueCodes(() => patch(next, [{ kind: 'archive_field', id: lumens, replacedBy: glow }]))
    ).toEqual(['replacement_immutable']);
    expect(
      issueCodes(() =>
        patch(next, [{ kind: 'put_field', id: lumens, typeId: lamp, archivedAt: null }])
      )
    ).toEqual(['replacement_requires_archive']);
    expect(field(next.draft, lumens)).toMatchObject({ replacedBy: brightness });
  });
});
