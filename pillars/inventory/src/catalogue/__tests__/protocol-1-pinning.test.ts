import { describe, expect, it } from 'vitest';

import { mutation, openHarness, seedItem } from '../../domain/commands/__tests__/test-utils.js';
import {
  loadProtocol1Fields,
  projectProtocol1Catalogue,
  resolveProtocol1Type,
  resolvePublishedType,
} from '../index.js';

function publishSyntheticRevisionTwo(harness: ReturnType<typeof openHarness>): void {
  harness.raw
    .prepare(
      `INSERT INTO catalogue_revisions
         (revision, base_revision, status, minimum_protocol, created_actor_kind, created_at)
       VALUES (2, 1, 'draft', 2, 'migration', 'now')`
    )
    .run();
  harness.raw
    .prepare(
      `INSERT INTO item_types
         (revision, id, key, label, sort_order, capabilities_json, legacy_labels_json, presentation_json)
       VALUES
         (2, 'b5ea5cd3-73b3-56dc-92e1-374eac720990', 'cable', 'Cable revision 2', 0, '[]', '[]', '{}'),
         (2, '00000000-0000-5000-8000-000000000002', 'future', 'Future', 1, '[]', '[]', '{}')`
    )
    .run();
  harness.raw
    .prepare(
      `INSERT INTO item_type_fields
         (revision, id, type_id, key, label, sort_order, kind, cardinality, required,
          storage, fixed_unit, reference_kinds_json, reference_type_ids_json, allow_override,
          presentation_json)
       VALUES
         (2, '080d8b20-fc2d-50f3-b74e-1c36db4fb30d',
          'b5ea5cd3-73b3-56dc-92e1-374eac720990', 'Distance', 'Distance', 0,
          'measurement', 'one', 0, 'stored', 'm', '[]', '[]', 0, '{}')`
    )
    .run();
  harness.raw
    .prepare(
      `UPDATE catalogue_revisions
       SET status = 'published', published_actor_kind = 'migration', published_at = 'now'
       WHERE revision = 2`
    )
    .run();
}

describe('protocol-1 catalogue pinning', () => {
  it('keeps descriptors, writes, and item values on revision 1 after revision 2 publishes', () => {
    const harness = openHarness();
    seedItem(harness, { id: 'cable', typeKey: 'cable' });
    harness.run(
      mutation('item.edit', 'cable', {
        fields: { Length: { value: 1, unit: 'm' } },
      })
    );
    publishSyntheticRevisionTwo(harness);

    expect(resolvePublishedType(harness.db, { key: 'future' })?.revision).toBe(2);
    expect(resolveProtocol1Type(harness.db, 'future')).toBeNull();
    expect(
      projectProtocol1Catalogue(harness.db).types.find((type) => type.key === 'cable')
    ).toMatchObject({
      name: 'Cable',
      fields: expect.arrayContaining([expect.objectContaining({ key: 'Length' })]),
    });
    expect(loadProtocol1Fields(harness.db, 'cable')).toEqual({
      Length: { value: 1, unit: 'm' },
    });
    expect(
      harness.run(
        mutation('item.changeType', 'cable', { typeKey: 'future', fields: {} }, { baseRevision: 2 })
      )
    ).toMatchObject({ status: 'rejected', reason: 'type_unknown' });
  });
});
