import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { itemFieldValues } from '../../db/schema.js';
import { openHarness, seedItem } from '../../domain/commands/__tests__/test-utils.js';
import { loadPublishedCatalogue } from '../catalogue.js';
import { executeCatalogueMigration } from '../migrations.js';

import type { CatalogueMigrationStep } from '../migration-types.js';

const CABLE_TYPE_ID = 'b5ea5cd3-73b3-56dc-92e1-374eac720990';
const CHARGER_TYPE_ID = 'f87ec1bf-55c1-53ec-9363-1a719e9c2dc3';
const REQUIRED_FIELD_ID = '50000000-0000-5000-8000-000000000001';
const INHERITED_ROOT_TYPE_ID = '60000000-0000-6000-8000-000000000001';
const INHERITED_ROOT_FIELD_ID = '70000000-0000-7000-8000-000000000001';
const LEGACY_REPLACEMENT_FIELD_ID = '70000000-0000-7000-8000-000000000002';
const LEGACY_RESALE_FIELD_ID = '70000000-0000-7000-8000-000000000003';
const CHARGER_SOURCE_FIELD_ID = '2dcac60b-6515-59f4-9e0e-886c58d14abc';
const CABLE_INHERITED_FIELD_IDS = [
  '6593f287-5fb7-52fc-bcaf-9289fd570755',
  'ff7481ba-c459-5302-8333-79d5c358772b',
  'b1567f93-09fe-5690-97d3-5500b3d86bce',
  '057ccccc-ff81-517f-b12c-795ce097db76',
  '080d8b20-fc2d-50f3-b74e-1c36db4fb30d',
  '65005db7-d541-5275-a1ab-da7981254135',
] as const;

function dropSteps(fieldIds: readonly string[]): CatalogueMigrationStep[] {
  return fieldIds.map((fieldId) => ({ kind: 'drop_value', fieldId }));
}

function seedStoredValue(
  harness: ReturnType<typeof openHarness>,
  itemId: string,
  fieldId: string,
  value: string,
  revision = 1
): void {
  harness.raw
    .prepare(
      `INSERT INTO item_field_values
         (item_id, field_id, source, ordinal, value_json, catalogue_revision, created_at, updated_at)
       VALUES (?, ?, 'stored', 0, ?, ?, '2026-09-22T00:00:00.000Z', '2026-09-22T00:00:00.000Z')`
    )
    .run(itemId, fieldId, JSON.stringify(value), revision);
}

function changedEffectiveFieldIds(
  baseType: NonNullable<ReturnType<typeof loadPublishedCatalogue>>['types'][number],
  candidateType: NonNullable<ReturnType<typeof loadPublishedCatalogue>>['types'][number]
): string[] {
  const baseIds = new Set(baseType.effectiveFields.map((field) => field.id));
  const candidateIds = new Set(candidateType.effectiveFields.map((field) => field.id));
  return [...new Set([...baseIds, ...candidateIds])]
    .filter((fieldId) => baseIds.has(fieldId) !== candidateIds.has(fieldId))
    .toSorted();
}

function publishCandidate(
  harness: ReturnType<typeof openHarness>,
  options: {
    readonly sourceRevision?: number;
    readonly candidateRevision?: number;
    readonly reparentTypeId?: string;
    readonly addInheritedRoot?: boolean;
    readonly addRequiredField?: boolean;
    readonly requiredFieldKind?: 'decimal' | 'short_text';
    readonly addLegacyFields?: boolean;
  } = {}
): void {
  const sourceRevision = options.sourceRevision ?? 1;
  const candidateRevision = options.candidateRevision ?? sourceRevision + 1;
  harness.raw
    .prepare(
      `INSERT INTO catalogue_revisions
         (revision, base_revision, status, minimum_protocol, created_actor_kind, created_at)
       VALUES (?, ?, 'draft', 2, 'web', 'now')`
    )
    .run(candidateRevision, sourceRevision);
  harness.raw
    .prepare(
      `INSERT INTO item_types
       SELECT ?, id, key, label, description, sort_order, capabilities_json,
              legacy_labels_json, presentation_json, archived_at, replaced_by, parent_type_id
       FROM item_types WHERE revision = ?`
    )
    .run(candidateRevision, sourceRevision);
  harness.raw
    .prepare(
      `INSERT INTO item_type_fields
       SELECT ?, id, type_id, key, label, help, sort_order, kind, cardinality, required,
              storage, fixed_unit, reference_kinds_json, reference_type_ids_json,
              expression_version, expression_json, allow_override, presentation_json, archived_at,
              replaced_by, default_values_json
       FROM item_type_fields WHERE revision = ?`
    )
    .run(candidateRevision, sourceRevision);
  harness.raw
    .prepare(
      `INSERT INTO field_enum_options
       SELECT ?, id, field_id, key, label, sort_order, archived_at
       FROM field_enum_options WHERE revision = ?`
    )
    .run(candidateRevision, sourceRevision);
  if (options.addRequiredField ?? true) {
    const requiredFieldInsert =
      options.requiredFieldKind === 'short_text'
        ? `INSERT INTO item_type_fields
           (revision, id, type_id, key, label, sort_order, kind, cardinality, required,
            storage, fixed_unit, reference_kinds_json, reference_type_ids_json, allow_override,
            presentation_json)
         VALUES (?, ?, ?, 'rating', 'Rating', 99, 'short_text', 'one', 1,
                 'stored', NULL, '[]', '[]', 0, '{}')`
        : `INSERT INTO item_type_fields
           (revision, id, type_id, key, label, sort_order, kind, cardinality, required,
            storage, fixed_unit, reference_kinds_json, reference_type_ids_json, allow_override,
            presentation_json)
         VALUES (?, ?, ?, 'rating', 'Rating', 99, 'decimal', 'one', 1,
                 'stored', NULL, '[]', '[]', 0, '{}')`;
    harness.raw
      .prepare(requiredFieldInsert)
      .run(candidateRevision, REQUIRED_FIELD_ID, CABLE_TYPE_ID);
  }
  if (options.addInheritedRoot) {
    harness.raw
      .prepare(
        `INSERT INTO item_types
           (revision, id, key, label, description, sort_order, capabilities_json,
            legacy_labels_json, presentation_json, archived_at, replaced_by, parent_type_id)
         VALUES (?, ?, 'rollout_root', 'Rollout root', NULL, 0, '[]', '[]', '{}', NULL, NULL, NULL)`
      )
      .run(candidateRevision, INHERITED_ROOT_TYPE_ID);
    harness.raw
      .prepare(
        `INSERT INTO item_type_fields
           (revision, id, type_id, key, label, help, sort_order, kind, cardinality, required,
            storage, fixed_unit, reference_kinds_json, reference_type_ids_json,
            expression_version, expression_json, allow_override, presentation_json,
            archived_at, replaced_by, default_values_json)
         VALUES (?, ?, ?, 'rollout_field', 'Rollout field', NULL, 0, 'short_text', 'one', 1,
                 'stored', NULL, '[]', '[]', NULL, NULL, 0, '{}', NULL, NULL, '[]')`
      )
      .run(candidateRevision, INHERITED_ROOT_FIELD_ID, INHERITED_ROOT_TYPE_ID);
    if (options.addLegacyFields) {
      harness.raw
        .prepare(
          `INSERT INTO item_type_fields
             (revision, id, type_id, key, label, sort_order, kind, cardinality, required,
              storage, fixed_unit, reference_kinds_json, reference_type_ids_json, allow_override,
              presentation_json)
           VALUES (?, ?, ?, 'replacement_value', 'Replacement value', 1, 'measurement', 'one', 0,
                   'stored', 'AUD', '[]', '[]', 0, '{}'),
                  (?, ?, ?, 'resale_value', 'Resale value', 2, 'measurement', 'one', 0,
                   'stored', 'AUD', '[]', '[]', 0, '{}')`
        )
        .run(
          candidateRevision,
          LEGACY_REPLACEMENT_FIELD_ID,
          INHERITED_ROOT_TYPE_ID,
          candidateRevision,
          LEGACY_RESALE_FIELD_ID,
          INHERITED_ROOT_TYPE_ID
        );
    }
  }
  if (options.reparentTypeId !== undefined) {
    harness.raw
      .prepare(`UPDATE item_types SET parent_type_id = ? WHERE revision = ? AND id = ?`)
      .run(
        options.addInheritedRoot ? INHERITED_ROOT_TYPE_ID : CABLE_TYPE_ID,
        candidateRevision,
        options.reparentTypeId
      );
  }
  harness.raw
    .prepare(
      `UPDATE catalogue_revisions
       SET status = 'published', published_actor_kind = 'web', published_at = 'now'
       WHERE revision = ?`
    )
    .run(candidateRevision);
}

function publishContainmentGrant(
  harness: ReturnType<typeof openHarness>,
  reparentTypeId?: string
): void {
  harness.raw
    .prepare(
      `INSERT INTO catalogue_revisions
         (revision, base_revision, status, minimum_protocol, created_actor_kind, created_at)
       VALUES (2, 1, 'draft', 2, 'web', 'now')`
    )
    .run();
  harness.raw
    .prepare(
      `INSERT INTO item_types
       SELECT 2, id, key, label, description, sort_order,
              CASE WHEN id = ? THEN '["containment"]' ELSE capabilities_json END,
              legacy_labels_json, presentation_json, archived_at, replaced_by, parent_type_id
       FROM item_types WHERE revision = 1`
    )
    .run(CABLE_TYPE_ID);
  if (reparentTypeId !== undefined) {
    harness.raw
      .prepare(`UPDATE item_types SET parent_type_id = ? WHERE revision = 2 AND id = ?`)
      .run(CABLE_TYPE_ID, reparentTypeId);
  }
  harness.raw
    .prepare(
      `INSERT INTO item_type_fields
       SELECT 2, id, type_id, key, label, help, sort_order, kind, cardinality, required,
              storage, fixed_unit, reference_kinds_json, reference_type_ids_json,
              expression_version, expression_json, allow_override, presentation_json, archived_at,
              replaced_by, default_values_json
       FROM item_type_fields WHERE revision = 1`
    )
    .run();
  harness.raw
    .prepare(
      `INSERT INTO field_enum_options
       SELECT 2, id, field_id, key, label, sort_order, archived_at
       FROM field_enum_options WHERE revision = 1`
    )
    .run();
  harness.raw
    .prepare(
      `UPDATE catalogue_revisions
       SET status = 'published', published_actor_kind = 'web', published_at = 'now'
       WHERE revision = 2`
    )
    .run();
}

describe('executeCatalogueMigration granting containment (ADR-002 D3)', () => {
  it('refuses to grant containment to a type whose live item has quantity greater than 1', () => {
    const harness = openHarness();
    seedItem(harness, { id: 'cable-group', typeKey: 'cable', quantity: 3 });
    publishContainmentGrant(harness);
    const candidate = loadPublishedCatalogue(harness.db, 2);
    if (!candidate) throw new Error('candidate catalogue was not published');

    expect(() =>
      executeCatalogueMigration(
        harness.db,
        {
          name: 'grant-cable-containment',
          fromRevision: 1,
          toRevision: 2,
          affectedTypeIds: [CABLE_TYPE_ID],
          affectedFieldIds: [],
          steps: [],
        },
        candidate,
        '2026-09-22T00:00:00.000Z'
      )
    ).toThrow(/quantity greater than 1/u);
    expect(harness.item('cable-group')).toMatchObject({ isContainer: 0, quantity: 3 });
  });

  it('grants containment when every live item of the type already has quantity 1', () => {
    const harness = openHarness();
    seedItem(harness, { id: 'cable-single', typeKey: 'cable', quantity: 1 });
    publishContainmentGrant(harness);
    const candidate = loadPublishedCatalogue(harness.db, 2);
    if (!candidate) throw new Error('candidate catalogue was not published');

    expect(
      executeCatalogueMigration(
        harness.db,
        {
          name: 'grant-cable-containment',
          fromRevision: 1,
          toRevision: 2,
          affectedTypeIds: [CABLE_TYPE_ID],
          affectedFieldIds: [],
          steps: [],
        },
        candidate,
        '2026-09-22T00:00:00.000Z'
      )
    ).toEqual({ name: 'grant-cable-containment', affectedItems: 1 });
    expect(harness.item('cable-single')).toMatchObject({ isContainer: 1, access: 'open' });
  });

  it('grants inherited containment to live items of candidate descendants', () => {
    const harness = openHarness();
    seedItem(harness, { id: 'charger-child', typeKey: 'charger', quantity: 1 });
    publishContainmentGrant(harness, CHARGER_TYPE_ID);
    const candidate = loadPublishedCatalogue(harness.db, 2);
    if (!candidate) throw new Error('candidate catalogue was not published');

    expect(
      executeCatalogueMigration(
        harness.db,
        {
          name: 'grant-cable-containment',
          fromRevision: 1,
          toRevision: 2,
          affectedTypeIds: [CABLE_TYPE_ID, CHARGER_TYPE_ID],
          affectedFieldIds: [...CABLE_INHERITED_FIELD_IDS],
          steps: dropSteps(CABLE_INHERITED_FIELD_IDS),
        },
        candidate,
        '2026-09-22T00:00:00.000Z'
      )
    ).toEqual({ name: 'grant-cable-containment', affectedItems: 1 });
    expect(harness.item('charger-child')).toMatchObject({ isContainer: 1, access: 'open' });
  });
});

describe('executeCatalogueMigration', () => {
  it('requires a step for a required field inherited by a selected descendant', () => {
    const harness = openHarness();
    seedItem(harness, { id: 'charger-child', typeKey: 'charger' });
    publishCandidate(harness, { reparentTypeId: CHARGER_TYPE_ID });
    const candidate = loadPublishedCatalogue(harness.db, 2);
    if (!candidate) throw new Error('candidate catalogue was not published');

    expect(() =>
      executeCatalogueMigration(
        harness.db,
        {
          name: 'missing-inherited-rating',
          fromRevision: 1,
          toRevision: 2,
          affectedTypeIds: [CABLE_TYPE_ID, CHARGER_TYPE_ID],
          affectedFieldIds: [...CABLE_INHERITED_FIELD_IDS, REQUIRED_FIELD_ID],
          steps: dropSteps(CABLE_INHERITED_FIELD_IDS),
        },
        candidate,
        '2026-09-22T00:00:00.000Z'
      )
    ).toThrow(/Migration steps do not cover affected live item fields/u);
  });

  it('requires a step for a field lost from a selected descendant', () => {
    const harness = openHarness();
    seedItem(harness, { id: 'charger-child', typeKey: 'charger' });
    publishCandidate(harness, {
      addRequiredField: false,
      reparentTypeId: CHARGER_TYPE_ID,
    });
    const revisionTwo = loadPublishedCatalogue(harness.db, 2);
    if (!revisionTwo) throw new Error('intermediate catalogue revision is missing');
    expect(revisionTwo.types.find((type) => type.id === CHARGER_TYPE_ID)?.parentTypeId).toBe(
      CABLE_TYPE_ID
    );
    publishCandidate(harness, {
      sourceRevision: 2,
      candidateRevision: 3,
      addInheritedRoot: true,
      addRequiredField: false,
      reparentTypeId: CHARGER_TYPE_ID,
    });
    const base = loadPublishedCatalogue(harness.db, 2);
    const candidate = loadPublishedCatalogue(harness.db, 3);
    if (!base || !candidate) throw new Error('catalogue revision is missing');
    const baseType = base.types.find((type) => type.id === CHARGER_TYPE_ID);
    const candidateType = candidate.types.find((type) => type.id === CHARGER_TYPE_ID);
    const rootFieldId = candidate.types.find((type) => type.key === 'rollout_root')?.fields[0]?.id;
    if (!baseType || !candidateType || !rootFieldId) {
      throw new Error('reparent migration fixture is incomplete');
    }
    const affectedFieldIds = changedEffectiveFieldIds(baseType, candidateType);
    expect(affectedFieldIds).toContain(rootFieldId);

    expect(() =>
      executeCatalogueMigration(
        harness.db,
        {
          name: 'missing-lost-field-step',
          fromRevision: 2,
          toRevision: 3,
          affectedTypeIds: [CHARGER_TYPE_ID],
          affectedFieldIds,
          steps: [{ kind: 'set_default', fieldId: rootFieldId, values: ['Object'] }],
        },
        candidate,
        '2026-09-22T00:00:00.000Z'
      )
    ).toThrow(/Migration steps do not cover affected live item fields/u);

    const lostFieldIds = affectedFieldIds.filter(
      (fieldId) =>
        baseType.effectiveFields.some((field) => field.id === fieldId) &&
        !candidateType.effectiveFields.some((field) => field.id === fieldId)
    );
    expect(
      executeCatalogueMigration(
        harness.db,
        {
          name: 'drop-lost-fields',
          fromRevision: 2,
          toRevision: 3,
          affectedTypeIds: [CHARGER_TYPE_ID],
          affectedFieldIds,
          steps: [
            ...dropSteps(lostFieldIds),
            { kind: 'set_default', fieldId: rootFieldId, values: ['Object'] },
          ],
        },
        candidate,
        '2026-09-22T00:00:00.000Z'
      )
    ).toEqual({ name: 'drop-lost-fields', affectedItems: 1 });
  });

  it('migrates live items of candidate descendants with inherited required fields', () => {
    const harness = openHarness();
    seedItem(harness, { id: 'charger-child', typeKey: 'charger' });
    publishCandidate(harness, { reparentTypeId: CHARGER_TYPE_ID });
    const candidate = loadPublishedCatalogue(harness.db, 2);
    if (!candidate) throw new Error('candidate catalogue was not published');

    expect(
      executeCatalogueMigration(
        harness.db,
        {
          name: 'add-inherited-rating',
          fromRevision: 1,
          toRevision: 2,
          affectedTypeIds: [CABLE_TYPE_ID, CHARGER_TYPE_ID],
          affectedFieldIds: [...CABLE_INHERITED_FIELD_IDS, REQUIRED_FIELD_ID],
          steps: [
            ...dropSteps(CABLE_INHERITED_FIELD_IDS),
            { kind: 'set_default', fieldId: REQUIRED_FIELD_ID, values: ['5.000'] },
          ],
        },
        candidate,
        '2026-09-22T00:00:00.000Z'
      )
    ).toEqual({ name: 'add-inherited-rating', affectedItems: 1 });
    expect(
      harness.db
        .select({ valueJson: itemFieldValues.valueJson })
        .from(itemFieldValues)
        .where(eq(itemFieldValues.fieldId, REQUIRED_FIELD_ID))
        .get()
    ).toEqual({ valueJson: '"5.000"' });
  });

  it('allows a copy between fields inherited by the selected descendant', () => {
    const harness = openHarness();
    seedItem(harness, { id: 'charger-child', typeKey: 'charger' });
    seedStoredValue(harness, 'charger-child', CHARGER_SOURCE_FIELD_ID, 'from-charger');
    publishCandidate(harness, {
      reparentTypeId: CHARGER_TYPE_ID,
      requiredFieldKind: 'short_text',
    });
    const candidate = loadPublishedCatalogue(harness.db, 2);
    if (!candidate) throw new Error('candidate catalogue was not published');

    expect(
      executeCatalogueMigration(
        harness.db,
        {
          name: 'copy-inherited-rating',
          fromRevision: 1,
          toRevision: 2,
          affectedTypeIds: [CABLE_TYPE_ID, CHARGER_TYPE_ID],
          affectedFieldIds: [...CABLE_INHERITED_FIELD_IDS, REQUIRED_FIELD_ID],
          steps: [
            ...dropSteps(CABLE_INHERITED_FIELD_IDS),
            { kind: 'copy', fromFieldId: CHARGER_SOURCE_FIELD_ID, toFieldId: REQUIRED_FIELD_ID },
          ],
        },
        candidate,
        '2026-09-22T00:00:00.000Z'
      )
    ).toEqual({ name: 'copy-inherited-rating', affectedItems: 1 });
    expect(
      harness.db
        .select({ valueJson: itemFieldValues.valueJson })
        .from(itemFieldValues)
        .where(eq(itemFieldValues.fieldId, REQUIRED_FIELD_ID))
        .get()
    ).toEqual({ valueJson: '"from-charger"' });
  });

  it('copies finite legacy values into inherited measurement fields', () => {
    const harness = openHarness();
    seedItem(harness, { id: 'charger-child', typeKey: 'charger' });
    harness.raw
      .prepare(
        `UPDATE items
         SET replacement_value = ?, resale_value = ?
         WHERE id = ?`
      )
      .run(123.45, 67.89, 'charger-child');
    publishCandidate(harness, {
      addInheritedRoot: true,
      addLegacyFields: true,
      addRequiredField: false,
      reparentTypeId: CHARGER_TYPE_ID,
    });
    const candidate = loadPublishedCatalogue(harness.db, 2);
    if (!candidate) throw new Error('candidate catalogue was not published');

    expect(
      executeCatalogueMigration(
        harness.db,
        {
          name: 'copy-legacy-values',
          fromRevision: 1,
          toRevision: 2,
          affectedTypeIds: [CHARGER_TYPE_ID],
          affectedFieldIds: [
            INHERITED_ROOT_FIELD_ID,
            LEGACY_REPLACEMENT_FIELD_ID,
            LEGACY_RESALE_FIELD_ID,
          ],
          steps: [
            { kind: 'set_default', fieldId: INHERITED_ROOT_FIELD_ID, values: ['Object'] },
            {
              kind: 'copy_legacy_value',
              source: 'replacementValue',
              toFieldId: LEGACY_REPLACEMENT_FIELD_ID,
            },
            {
              kind: 'copy_legacy_value',
              source: 'resaleValue',
              toFieldId: LEGACY_RESALE_FIELD_ID,
            },
          ],
        },
        candidate,
        '2026-09-22T00:00:00.000Z'
      )
    ).toEqual({ name: 'copy-legacy-values', affectedItems: 1 });
    expect(
      harness.raw
        .prepare(
          `SELECT field_id AS fieldId, value_json AS valueJson
           FROM item_field_values WHERE item_id = ? ORDER BY field_id`
        )
        .all('charger-child')
    ).toEqual([
      { fieldId: INHERITED_ROOT_FIELD_ID, valueJson: '"Object"' },
      {
        fieldId: LEGACY_REPLACEMENT_FIELD_ID,
        valueJson: '{"amount":"123.45","unit":"AUD"}',
      },
      { fieldId: LEGACY_RESALE_FIELD_ID, valueJson: '{"amount":"67.89","unit":"AUD"}' },
    ]);
    expect(harness.item('charger-child')).toMatchObject({
      replacementValue: 123.45,
      resaleValue: 67.89,
    });
  });

  it('dry-runs, writes canonical values, and appends an ordinary item event', () => {
    const harness = openHarness();
    seedItem(harness, { id: 'cable', typeKey: 'cable' });
    publishCandidate(harness);
    const candidate = loadPublishedCatalogue(harness.db, 2);
    if (!candidate) throw new Error('candidate catalogue was not published');

    expect(
      executeCatalogueMigration(
        harness.db,
        {
          name: 'add-cable-rating',
          fromRevision: 1,
          toRevision: 2,
          affectedTypeIds: [CABLE_TYPE_ID],
          affectedFieldIds: [REQUIRED_FIELD_ID],
          steps: [{ kind: 'set_default', fieldId: REQUIRED_FIELD_ID, values: ['5.000'] }],
        },
        candidate,
        '2026-09-22T00:00:00.000Z'
      )
    ).toEqual({ name: 'add-cable-rating', affectedItems: 1 });
    expect(
      harness.db
        .select({ valueJson: itemFieldValues.valueJson })
        .from(itemFieldValues)
        .where(eq(itemFieldValues.fieldId, REQUIRED_FIELD_ID))
        .get()
    ).toEqual({ valueJson: '"5.000"' });
    expect(
      harness.raw
        .prepare(
          `SELECT kind, reason, actor_kind AS actorKind FROM events WHERE entity_id = ? ORDER BY seq DESC LIMIT 1`
        )
        .get('cable')
    ).toEqual({ kind: 'migrated', reason: 'add-cable-rating', actorKind: 'migration' });
    expect(
      harness.raw.prepare(`SELECT field_text AS fieldText FROM items_fts WHERE id = ?`).get('cable')
    ).toEqual({ fieldText: '5.000' });
  });

  it('rolls back every row when the dry-run finds an invalid default', () => {
    const harness = openHarness();
    seedItem(harness, { id: 'cable-a', typeKey: 'cable' });
    seedItem(harness, { id: 'cable-b', typeKey: 'cable' });
    publishCandidate(harness);
    const candidate = loadPublishedCatalogue(harness.db, 2);
    if (!candidate) throw new Error('candidate catalogue was not published');

    expect(() =>
      executeCatalogueMigration(
        harness.db,
        {
          name: 'invalid-cable-rating',
          fromRevision: 1,
          toRevision: 2,
          affectedTypeIds: [CABLE_TYPE_ID],
          affectedFieldIds: [REQUIRED_FIELD_ID],
          steps: [{ kind: 'set_default', fieldId: REQUIRED_FIELD_ID, values: [5] }],
        },
        candidate,
        '2026-09-22T00:00:00.000Z'
      )
    ).toThrow(/canonical decimal/u);
    expect(
      harness.raw
        .prepare(`SELECT count(*) AS count FROM item_field_values WHERE field_id = ?`)
        .get(REQUIRED_FIELD_ID)
    ).toEqual({ count: 0 });
    expect(
      harness.raw.prepare(`SELECT count(*) AS count FROM events WHERE kind = 'migrated'`).get()
    ).toEqual({ count: 0 });
  });
});
