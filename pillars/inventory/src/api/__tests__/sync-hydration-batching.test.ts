import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { publishComputedType } from '../../catalogue/__tests__/computed-catalogue-fixture.js';
import { publishReferenceComputedTypes } from '../../catalogue/__tests__/computed-reference-fixture.js';
import { resolveProtocol1Type } from '../../catalogue/catalogue.js';
import { loadPublishedCatalogue } from '../../catalogue/catalogue.js';
import { clearComputedValueCache } from '../../catalogue/computed-value-runtime-cache.js';
import * as expressionValidation from '../../catalogue/expression-validator.js';
import { ItemValueReader } from '../../catalogue/item-value-reader.js';
import { loadLegacyFieldsWithIssues } from '../../catalogue/protocol-1-read.js';
import { itemFieldValues, items } from '../../db/schema.js';
import { openHarness, seedItem } from '../../domain/commands/__tests__/test-utils.js';
import { loadItemExtras } from '../sync/wire.js';

import type { Harness } from '../../domain/commands/__tests__/test-utils.js';

let harness: Harness;

afterEach(() => {
  vi.restoreAllMocks();
  harness?.raw.close();
});

function seedTypedItem(typeId: string, fieldId: string, value: unknown, revision: number): string {
  const itemId = randomUUID();
  seedItem(harness, { id: itemId });
  harness.db.update(items).set({ typeId }).where(eq(items.id, itemId)).run();
  harness.db
    .insert(itemFieldValues)
    .values({
      itemId,
      fieldId,
      source: 'stored',
      ordinal: 0,
      valueJson: JSON.stringify(value),
      catalogueRevision: revision,
      createdAt: 'now',
      updatedAt: 'now',
    })
    .run();
  return itemId;
}

describe('batched sync item hydration', () => {
  it('keeps stored and computed hydration queries bounded as a page grows from one item to fifty', () => {
    harness = openHarness();
    const catalogue = publishComputedType(harness.db);
    const ids = Array.from({ length: 50 }, (_, index) =>
      seedTypedItem(catalogue.typeId, catalogue.inputFieldId, index + 1, catalogue.revision)
    );
    const prepare = vi.spyOn(harness.raw, 'prepare');
    clearComputedValueCache(harness.db);
    const single = loadItemExtras(harness.db, ids.slice(0, 1));
    const singleQueries = prepare.mock.calls.length;
    prepare.mockClear();
    clearComputedValueCache(harness.db);
    const page = loadItemExtras(harness.db, ids);

    expect(singleQueries).toBeGreaterThan(0);
    expect(prepare.mock.calls.length).toBe(singleQueries);
    expect(prepare.mock.calls.length).toBeLessThanOrEqual(20);
    expect(page.fieldValues.size).toBe(50);
    expect(page.computedValues.size).toBe(50);
    expect(page.computedValues.get(ids[0] ?? '')).toEqual(single.computedValues.get(ids[0] ?? ''));
    for (const [index, itemId] of ids.entries()) {
      expect(page.fieldValues.get(itemId)).toContainEqual({
        fieldId: catalogue.inputFieldId,
        source: 'stored',
        catalogueRevision: catalogue.revision,
        values: [index + 1],
      });
      expect(page.computedValues.get(itemId)).toContainEqual(
        expect.objectContaining({
          fieldId: catalogue.computedFieldId,
          state: 'ok',
          values: [(index + 1) * 2],
        })
      );
    }
  });

  it('shares reference states and dependency reads while isolating a malformed item', () => {
    harness = openHarness();
    const catalogue = publishReferenceComputedTypes(harness.db);
    const partId = seedTypedItem(
      catalogue.partTypeId,
      catalogue.weightFieldId,
      4,
      catalogue.revision
    );
    const ids = Array.from({ length: 50 }, () =>
      seedTypedItem(
        catalogue.kitTypeId,
        catalogue.kitPartFieldId,
        { targetKind: 'item', targetId: partId },
        catalogue.revision
      )
    );
    const prepare = vi.spyOn(harness.raw, 'prepare');
    clearComputedValueCache(harness.db);
    const single = loadItemExtras(harness.db, ids.slice(0, 1));
    const singleQueries = prepare.mock.calls.length;
    prepare.mockClear();
    clearComputedValueCache(harness.db);
    const page = loadItemExtras(harness.db, ids);
    expect(prepare.mock.calls.length).toBe(singleQueries);
    expect(single.computedValues.get(ids[0] ?? '')).toEqual(page.computedValues.get(ids[0] ?? ''));
    expect(page.fieldValues.get(ids[49] ?? '')?.[0]?.values).toEqual([
      { targetKind: 'item', targetId: partId, targetState: 'resolved' },
    ]);

    const malformedId = ids[0] ?? '';
    harness.raw
      .prepare('UPDATE item_field_values SET value_json = ? WHERE item_id = ?')
      .run('{"broken":true}', malformedId);
    clearComputedValueCache(harness.db);
    const damaged = loadItemExtras(harness.db, ids);
    expect(damaged.fieldValues.get(malformedId)).toEqual([]);
    expect(damaged.computedValues.get(malformedId)).toEqual([]);
    expect(damaged.projectionIssues.get(malformedId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'sync_value_projection_failed' }),
        expect.objectContaining({ code: 'computed_projection_failed' }),
      ])
    );
    expect(damaged.projectionIssues.get(ids[1] ?? '')).toBeUndefined();
    expect(damaged.computedValues.get(ids[1] ?? '')).toEqual(page.computedValues.get(ids[1] ?? ''));
  });

  it('batches distinct paths reaching the same computed dependency field across the page', () => {
    harness = openHarness();
    const catalogue = publishReferenceComputedTypes(harness.db, true);
    const rightFieldId = loadPublishedCatalogue(harness.db)
      ?.types.find((type) => type.id === catalogue.kitTypeId)
      ?.fields.find((field) => field.key === 'otherPart')?.id;
    if (rightFieldId === undefined) throw new Error('second reference field missing');
    const ids = Array.from({ length: 50 }, (_, index) => {
      const leftId = seedTypedItem(
        catalogue.partTypeId,
        catalogue.weightFieldId,
        index + 1,
        catalogue.revision
      );
      const rightId = seedTypedItem(
        catalogue.partTypeId,
        catalogue.weightFieldId,
        index + 2,
        catalogue.revision
      );
      const itemId = seedTypedItem(
        catalogue.kitTypeId,
        catalogue.kitPartFieldId,
        { targetKind: 'item', targetId: leftId },
        catalogue.revision
      );
      harness.db
        .insert(itemFieldValues)
        .values({
          itemId,
          fieldId: rightFieldId,
          source: 'stored',
          ordinal: 0,
          valueJson: JSON.stringify({ targetKind: 'item', targetId: rightId }),
          catalogueRevision: catalogue.revision,
          createdAt: 'now',
          updatedAt: 'now',
        })
        .run();
      return itemId;
    });
    const prepare = vi.spyOn(harness.raw, 'prepare');
    clearComputedValueCache(harness.db);
    loadItemExtras(harness.db, ids.slice(0, 1));
    const singleQueries = prepare.mock.calls.length;
    prepare.mockClear();
    clearComputedValueCache(harness.db);
    const page = loadItemExtras(harness.db, ids);

    expect(prepare.mock.calls.length).toBe(singleQueries);
    expect(prepare.mock.calls.length).toBeLessThanOrEqual(24);
    for (const [index, itemId] of ids.entries()) {
      expect(page.computedValues.get(itemId)).toContainEqual(
        expect.objectContaining({
          fieldId: catalogue.kitWeightFieldId,
          state: 'ok',
          values: [2 * index + 3],
        })
      );
    }
  });

  it.each([1, 2])(
    'preserves protocol %i compatibility projection and canonical multivalue ordering',
    (protocol) => {
      harness = openHarness();
      const type = resolveProtocol1Type(harness.db, 'book');
      const definition = type?.fields.find((field) => field.kind === 'short_text');
      if (type === null || definition === undefined) throw new Error('book text field missing');
      const itemId = seedTypedItem(type.id, definition.id, 'first', 1);
      harness.db
        .insert(itemFieldValues)
        .values({
          itemId,
          fieldId: definition.id,
          source: 'stored',
          ordinal: 1,
          valueJson: '"second"',
          catalogueRevision: 1,
          createdAt: 'now',
          updatedAt: 'now',
        })
        .run();
      const expected = loadLegacyFieldsWithIssues(harness.db, itemId, protocol);
      const result = loadItemExtras(harness.db, [itemId], protocol);

      expect(result.fields.get(itemId)).toEqual(expected.fields);
      expect(result.fieldValues.get(itemId)?.[0]?.values).toEqual(['first', 'second']);
      expect(result.projectionIssues.get(itemId) ?? []).toEqual(
        protocol === 1 ? expected.issues : []
      );
      expect(expected.issues).toContainEqual(
        expect.objectContaining({ fieldId: definition.id, code: 'field_cardinality_unsupported' })
      );
    }
  );

  it("chunks a many-valued reference workset beyond SQLite's parameter limit", () => {
    harness = openHarness();
    const catalogue = publishReferenceComputedTypes(harness.db);
    const itemId = randomUUID();
    seedItem(harness, { id: itemId });
    const insert = harness.raw.prepare(
      `INSERT INTO item_field_values
        (item_id, field_id, source, ordinal, value_json, catalogue_revision, created_at, updated_at)
        VALUES (?, ?, 'stored', ?, ?, ?, 'now', 'now')`
    );
    harness.raw.transaction(() => {
      for (let ordinal = 0; ordinal < 32767; ordinal += 1) {
        insert.run(
          itemId,
          catalogue.kitPartFieldId,
          ordinal,
          JSON.stringify({ targetKind: 'item', targetId: randomUUID() }),
          catalogue.revision
        );
      }
    })();
    const prepare = vi.spyOn(harness.raw, 'prepare');

    const reader = new ItemValueReader(harness.db, [itemId]);

    expect(reader.rows(itemId)).toHaveLength(32767);
    expect(prepare.mock.calls.length).toBe(67);
    expect(prepare.mock.calls.every(([sql]) => sql.split('?').length - 1 <= 500)).toBe(true);
  });

  it('retains canonical values and item-scoped issues when the shared expression graph is invalid', () => {
    harness = openHarness();
    const catalogue = publishComputedType(harness.db);
    const ids = [3, 4].map((value) =>
      seedTypedItem(catalogue.typeId, catalogue.inputFieldId, value, catalogue.revision)
    );
    vi.spyOn(expressionValidation, 'validateCatalogueExpressions').mockImplementation(() => {
      throw new Error('invalid shared expression graph');
    });

    const result = loadItemExtras(harness.db, ids);

    for (const [index, itemId] of ids.entries()) {
      expect(result.fieldValues.get(itemId)?.[0]?.values).toEqual([index + 3]);
      expect(result.computedValues.get(itemId)).toEqual([]);
      expect(result.projectionIssues.get(itemId)).toContainEqual(
        expect.objectContaining({ code: 'computed_projection_failed' })
      );
    }
  });

  it('does not query for empty input and keeps untyped or missing roots empty', () => {
    harness = openHarness();
    const itemId = randomUUID();
    const missingId = randomUUID();
    seedItem(harness, { id: itemId });
    const prepare = vi.spyOn(harness.raw, 'prepare');
    expect(loadItemExtras(harness.db, []).fields.size).toBe(0);
    expect(prepare).not.toHaveBeenCalled();
    const result = loadItemExtras(harness.db, [itemId, missingId]);
    expect(result.fields.get(itemId)).toEqual({});
    expect(result.fieldValues.get(itemId)).toEqual([]);
    expect(result.computedValues.get(itemId)).toEqual([]);
    expect(result.computedValues.get(missingId)).toEqual([]);
    expect(result.fields.has(missingId)).toBe(false);
    expect(result.projectionIssues.size).toBe(0);
  });
});
