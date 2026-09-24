import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { itemFieldValues } from '../../db/schema.js';
import { openHarness, seedItem } from '../../domain/commands/__tests__/test-utils.js';
import { loadPublishedCatalogue } from '../catalogue.js';
import { executeCatalogueMigration } from '../migrations.js';

const CABLE_TYPE_ID = 'b5ea5cd3-73b3-56dc-92e1-374eac720990';
const REQUIRED_FIELD_ID = '50000000-0000-5000-8000-000000000001';

function publishCandidate(harness: ReturnType<typeof openHarness>): void {
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
       SELECT 2, id, key, label, description, sort_order, capabilities_json,
              legacy_labels_json, presentation_json, archived_at, replaced_by
       FROM item_types WHERE revision = 1`
    )
    .run();
  harness.raw
    .prepare(
      `INSERT INTO item_type_fields
       SELECT 2, id, type_id, key, label, help, sort_order, kind, cardinality, required,
              storage, fixed_unit, reference_kinds_json, reference_type_ids_json,
              expression_version, expression_json, allow_override, presentation_json, archived_at,
              replaced_by
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
      `INSERT INTO item_type_fields
         (revision, id, type_id, key, label, sort_order, kind, cardinality, required,
          storage, fixed_unit, reference_kinds_json, reference_type_ids_json, allow_override,
          presentation_json)
       VALUES (2, ?, ?, 'rating', 'Rating', 99, 'decimal', 'one', 1,
               'stored', NULL, '[]', '[]', 0, '{}')`
    )
    .run(REQUIRED_FIELD_ID, CABLE_TYPE_ID);
  harness.raw
    .prepare(
      `UPDATE catalogue_revisions
       SET status = 'published', published_actor_kind = 'web', published_at = 'now'
       WHERE revision = 2`
    )
    .run();
}

describe('executeCatalogueMigration', () => {
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
