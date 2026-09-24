/**
 * Expression version 2 end to end: a box's width × height × depth publishes
 * as a volume in litres and reaches the sync wire converted into that unit,
 * a volume declared in a unit of another dimension does not publish, and a
 * `coalesce` with no value names every input it lacked.
 */
import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createCatalogueDraft,
  patchCatalogueDraft,
  publishCatalogueDraft,
} from '../../catalogue/authoring.js';
import { SyncItemSchema } from '../../contract/rest-sync-schemas.js';
import { openSyncHarness, PROTOCOL, send, wireMutation, type SyncHarness } from './sync-harness.js';
import { createTestTransport } from './test-http.js';

import type { CatalogueDescriptor } from '../../catalogue/authoring-types.js';
import type { ExpressionV1Shape } from '../../contract/rest-catalogue-expression-schema.js';
import type { CommandDb } from '../../domain/commands/entities.js';

const AUTHOR = { kind: 'web', id: 'owner', label: 'Owner' } as const;
const transport = createTestTransport();
let h: SyncHarness | undefined;

afterEach(() => {
  h?.close();
  h = undefined;
});

interface Ids {
  readonly revision: number;
  readonly boxTypeId: string;
  readonly width: string;
  readonly height: string;
  readonly depth: string;
  readonly volume: string;
  readonly best: string;
}

function target(draft: CatalogueDescriptor) {
  return {
    revision: draft.revision.revision,
    baseRevision: 1,
    expectedDraftVersion: draft.revision.draftVersion,
  };
}

function fieldId(draft: CatalogueDescriptor, key: string): string {
  const id = draft.types.find((type) => type.key === 'box')?.fields.find((f) => f.key === key)?.id;
  if (id === undefined) throw new Error(`box.${key} was not created`);
  return id;
}

function length(typeId: string, key: string, fixedUnit: string) {
  return {
    kind: 'put_field' as const,
    typeId,
    key,
    label: key,
    fieldKind: 'measurement' as const,
    cardinality: 'one' as const,
    required: false,
    storage: 'stored' as const,
    fixedUnit,
  };
}

function read(id: string): ExpressionV1Shape {
  return { op: 'read', path: [], fieldId: id };
}

/** A box with stored dimensions, a computed volume in `volumeUnit`, and a coalesce. */
function publish(db: CommandDb, volumeUnit: string): Ids {
  const created = createCatalogueDraft(db, 1, AUTHOR);
  const typed = patchCatalogueDraft(db, target(created), [
    { kind: 'put_type', key: 'box', label: 'Box' },
  ]).draft;
  const boxTypeId = typed.types.find((type) => type.key === 'box')?.id ?? '';
  const stored = patchCatalogueDraft(db, target(typed), [
    length(boxTypeId, 'width', 'cm'),
    length(boxTypeId, 'height', 'cm'),
    length(boxTypeId, 'depth', 'mm'),
  ]).draft;
  const width = fieldId(stored, 'width');
  const height = fieldId(stored, 'height');
  const depth = fieldId(stored, 'depth');
  const computedDraft = patchCatalogueDraft(db, target(stored), [
    {
      kind: 'put_field',
      typeId: boxTypeId,
      key: 'volume',
      label: 'Volume',
      fieldKind: 'measurement',
      cardinality: 'one',
      required: false,
      storage: 'computed',
      fixedUnit: volumeUnit,
      expressionVersion: 2,
      expression: {
        op: 'multiply',
        left: { op: 'multiply', left: read(width), right: read(height) },
        right: read(depth),
      },
      allowOverride: true,
    },
    {
      kind: 'put_field',
      typeId: boxTypeId,
      key: 'best',
      label: 'Best',
      fieldKind: 'measurement',
      cardinality: 'one',
      required: false,
      storage: 'computed',
      fixedUnit: 'cm',
      expressionVersion: 2,
      expression: { op: 'coalesce', values: [read(width), read(depth)] },
      allowOverride: false,
    },
  ]).draft;
  publishCatalogueDraft(
    db,
    created.revision.revision,
    { baseRevision: 1, expectedDraftVersion: computedDraft.revision.draftVersion, note: null },
    AUTHOR
  );
  return {
    revision: created.revision.revision,
    boxTypeId,
    width,
    height,
    depth,
    volume: fieldId(computedDraft, 'volume'),
    best: fieldId(computedDraft, 'best'),
  };
}

async function createBox(
  target: SyncHarness,
  ids: Ids,
  values: readonly { readonly fieldId: string; readonly amount: string; readonly unit: string }[]
): Promise<string> {
  const boxId = randomUUID();
  const response = await send(target.api, [
    wireMutation(
      'item.create',
      boxId,
      {
        item: {
          name: 'Box',
          typeId: ids.boxTypeId,
          values: values.map((entry) => ({
            fieldId: entry.fieldId,
            values: [{ amount: entry.amount, unit: entry.unit }],
          })),
        },
      },
      { catalogueRevision: ids.revision }
    ),
  ]);
  expect(response.body.outcomes[0]).toMatchObject({ status: 'applied' });
  return boxId;
}

async function computedValue(target: SyncHarness, itemId: string, id: string) {
  const response = await target.api.get('/sync/snapshot').set(PROTOCOL).query({ limit: 500 });
  const item = SyncItemSchema.array()
    .parse(response.body.items)
    .find((entry) => entry.id === itemId);
  return item?.computedValues.find((entry) => entry.fieldId === id);
}

describe('dimensional computed fields', () => {
  it('supplies a volume in L from width × height × depth in cm, cm and mm', async () => {
    h = openSyncHarness(transport);
    const ids = publish(h.db.db, 'L');
    const boxId = await createBox(h, ids, [
      { fieldId: ids.width, amount: '20', unit: 'cm' },
      { fieldId: ids.height, amount: '30', unit: 'cm' },
      { fieldId: ids.depth, amount: '400', unit: 'mm' },
    ]);

    expect(await computedValue(h, boxId, ids.volume)).toMatchObject({
      state: 'ok',
      values: [{ amount: '24.0000', unit: 'L' }],
    });
  });

  it('refuses to publish a volume declared in a unit of another dimension', () => {
    h = openSyncHarness(transport);
    const harness = h;
    expect(() => publish(harness.db.db, 'cm²')).toThrowError(
      expect.objectContaining({
        code: 'catalogue_validation_failed',
        issues: [
          expect.objectContaining({
            code: 'expression_type_mismatch',
            message: expect.stringContaining('received measurement in cm³ (length³)'),
          }),
        ],
      })
    );
  });

  it('names every missing input when no coalesce argument has a value', async () => {
    h = openSyncHarness(transport);
    const ids = publish(h.db.db, 'L');
    const boxId = await createBox(h, ids, [{ fieldId: ids.height, amount: '30', unit: 'cm' }]);

    expect(await computedValue(h, boxId, ids.best)).toMatchObject({
      state: 'unavailable',
      reason: 'missing_dependency',
      failedFieldId: ids.depth,
      missingInputs: [
        { reason: 'missing_dependency', fieldId: ids.width, itemId: boxId },
        { reason: 'missing_dependency', fieldId: ids.depth, itemId: boxId },
      ],
    });
    expect(await computedValue(h, boxId, ids.volume)).toMatchObject({
      state: 'unavailable',
      missingInputs: [{ reason: 'missing_dependency', fieldId: ids.width, itemId: boxId }],
    });
  });
});
