/**
 * A computed field that reads itself on the item's assembly inherits its
 * value up the whole assembly chain; an override on any item in the chain
 * stops the inheritance there, and a part link change moves the value with
 * no write to the parts themselves.
 */
import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import { activatePersistedCatalogueProtocol } from '../../catalogue/__tests__/protocol-rollout-fixture.js';
import {
  createCatalogueDraft,
  patchCatalogueDraft,
  publishCatalogueDraft,
} from '../../catalogue/authoring.js';
import { readEffectiveItemFieldValues } from '../../catalogue/effective-item-values.js';
import { loadPublishedCatalogue } from '../../catalogue/index.js';
import { addPart, removePart } from '../modules/parts/service.js';
import { apply, changesSince, computed, highWater, row } from './computed-feed-fixture.js';
import { openSyncHarness, wireMutation, type SyncHarness } from './sync-harness.js';
import { createTestTransport } from './test-http.js';

import type { CatalogueDescriptor, DraftOperation } from '../../catalogue/authoring-types.js';
import type { DraftTarget } from '../../catalogue/authoring.js';
import type { EffectiveItemFieldValue } from '../../catalogue/item-value-types.js';

const transport = createTestTransport();
const AUTHOR = { kind: 'web', id: 'owner', label: 'Owner' } as const;
let h: SyncHarness | undefined;

afterEach(() => {
  h?.close();
  h = undefined;
});

interface AvailabilityCatalogue {
  readonly revision: number;
  readonly thingTypeId: string;
  readonly availabilityFieldId: string;
  readonly inUse: string;
  readonly loose: string;
}

function target(draft: CatalogueDescriptor): DraftTarget {
  return {
    revision: draft.revision.revision,
    baseRevision: 1,
    expectedDraftVersion: draft.revision.draftVersion,
  };
}

function optionId(draft: CatalogueDescriptor, fieldId: string, key: string): string {
  const option = draft.types
    .flatMap((type) => type.fields)
    .find((field) => field.id === fieldId)
    ?.enumOptions.find((entry) => entry.key === key);
  if (option === undefined) throw new Error(`option ${key} was not created`);
  return option.id;
}

function computedAvailability(
  thingTypeId: string,
  field: { readonly id?: string; readonly reads: string },
  expressionVersion: 2 | 3
): DraftOperation {
  return {
    kind: 'put_field',
    ...(field.id === undefined ? {} : { id: field.id }),
    typeId: thingTypeId,
    key: 'availability',
    label: 'Availability',
    fieldKind: 'enum',
    cardinality: 'one',
    required: false,
    storage: 'computed',
    expressionVersion,
    expression: { op: 'assembly_read', fieldId: field.reads },
    allowOverride: true,
  };
}

function fieldIdOf(draft: CatalogueDescriptor, typeId: string, key: string): string {
  const id = draft.types
    .find((type) => type.id === typeId)
    ?.fields.find((field) => field.key === key)?.id;
  if (id === undefined) throw new Error(`${key} was not created`);
  return id;
}

/**
 * A draft with a `thing` type that grants `parts` and a stored enum
 * `condition`. A new field's id is minted by the server, so a field that
 * reads itself is first placed reading another field of its kind.
 */
function thingDraft(db: SyncHarness['db']['db']) {
  activatePersistedCatalogueProtocol(db);
  const created = createCatalogueDraft(db, 1, AUTHOR);
  const withType = patchCatalogueDraft(db, target(created), [
    { kind: 'put_type', key: 'thing', label: 'Thing', capabilities: ['parts'] },
  ]).draft;
  const thingTypeId = withType.types.find((type) => type.key === 'thing')?.id;
  if (thingTypeId === undefined) throw new Error('thing type was not created');
  const draft = patchCatalogueDraft(db, target(withType), [
    {
      kind: 'put_field',
      typeId: thingTypeId,
      key: 'condition',
      label: 'Condition',
      fieldKind: 'enum',
      cardinality: 'one',
      required: false,
      storage: 'stored',
    },
  ]).draft;
  return {
    revision: created.revision.revision,
    draft,
    thingTypeId,
    conditionFieldId: fieldIdOf(draft, thingTypeId, 'condition'),
  };
}

function publishAvailability(db: SyncHarness['db']['db']): AvailabilityCatalogue {
  const { revision, draft, thingTypeId, conditionFieldId } = thingDraft(db);
  const placed = patchCatalogueDraft(db, target(draft), [
    computedAvailability(thingTypeId, { reads: conditionFieldId }, 3),
  ]).draft;
  const availabilityFieldId = fieldIdOf(placed, thingTypeId, 'availability');
  const withOptions = patchCatalogueDraft(db, target(placed), [
    computedAvailability(thingTypeId, { id: availabilityFieldId, reads: availabilityFieldId }, 3),
    { kind: 'put_enum_option', fieldId: availabilityFieldId, key: 'in_use', label: 'In use' },
    { kind: 'put_enum_option', fieldId: availabilityFieldId, key: 'loose', label: 'Loose' },
  ]).draft;
  publishCatalogueDraft(
    db,
    revision,
    { baseRevision: 1, expectedDraftVersion: withOptions.revision.draftVersion, note: null },
    AUTHOR
  );
  return {
    revision,
    thingTypeId,
    availabilityFieldId,
    inUse: optionId(withOptions, availabilityFieldId, 'in_use'),
    loose: optionId(withOptions, availabilityFieldId, 'loose'),
  };
}

async function createThing(target: SyncHarness, c: AvailabilityCatalogue, name: string) {
  const id = randomUUID();
  await apply(
    target,
    wireMutation(
      'item.create',
      id,
      { item: { name, typeId: c.thingTypeId, values: [] } },
      { catalogueRevision: c.revision }
    )
  );
  return id;
}

async function setAvailability(
  target: SyncHarness,
  c: AvailabilityCatalogue,
  itemId: string,
  baseRevision: number,
  option: string
): Promise<void> {
  await apply(
    target,
    wireMutation(
      'item.setOverride',
      itemId,
      { fieldId: c.availabilityFieldId, values: [{ optionId: option }] },
      { baseRevision, catalogueRevision: c.revision }
    )
  );
}

function availability(
  target: SyncHarness,
  c: AvailabilityCatalogue,
  itemId: string
): EffectiveItemFieldValue {
  const catalogue = loadPublishedCatalogue(target.db.db);
  if (catalogue === null) throw new Error('no published catalogue');
  const value = readEffectiveItemFieldValues(target.db.db, catalogue, itemId).find(
    (entry) => entry.fieldId === c.availabilityFieldId
  );
  if (value === undefined) throw new Error(`${itemId} has no availability`);
  return value;
}

interface Chain {
  readonly target: SyncHarness;
  readonly c: AvailabilityCatalogue;
  readonly computer: string;
  readonly board: string;
  readonly chip: string;
}

/** A computer in use, a board that is a part of it and a chip that is a part of the board. */
async function chain(): Promise<Chain> {
  h = openSyncHarness(transport);
  const c = publishAvailability(h.db.db);
  const computer = await createThing(h, c, 'Computer');
  const board = await createThing(h, c, 'Board');
  const chip = await createThing(h, c, 'Chip');
  await setAvailability(h, c, computer, 1, c.inUse);
  addPart(h.db.db, computer, board);
  addPart(h.db.db, board, chip);
  return { target: h, c, computer, board, chip };
}

describe('assembly reads', () => {
  it('inherits the nearest overridden value up a chain of assemblies', async () => {
    const { target, c, computer, board, chip } = await chain();

    expect(availability(target, c, chip)).toMatchObject({
      state: 'value',
      values: [{ optionId: c.inUse }],
      provenance: { source: 'computed' },
    });
    const chipValue = availability(target, c, chip);
    if (chipValue.state !== 'value' || chipValue.provenance.source !== 'computed')
      throw new Error('chip did not compute');
    expect(chipValue.provenance.dependencies.map((entry) => entry.itemId).toSorted()).toEqual(
      [board, computer].toSorted()
    );
  });

  it('lets an override on a part win over its assembly', async () => {
    const { target, c, chip } = await chain();

    await setAvailability(target, c, chip, 1, c.loose);

    expect(availability(target, c, chip)).toMatchObject({
      state: 'value',
      values: [{ optionId: c.loose }],
      provenance: { source: 'override' },
    });
  });

  it('is unavailable on an item that is not a part and has no override', async () => {
    h = openSyncHarness(transport);
    const c = publishAvailability(h.db.db);
    const loose = await createThing(h, c, 'Loose');

    expect(availability(h, c, loose)).toMatchObject({
      state: 'unavailable',
      reason: 'missing_dependency',
      fieldId: c.availabilityFieldId,
      traversedItemIds: [loose],
    });
  });

  it('follows a part to its new assembly with no write to the part', async () => {
    const { target, c, board, chip } = await chain();
    const shelf = await createThing(target, c, 'Shelf kit');
    await setAvailability(target, c, shelf, 1, c.loose);
    expect(availability(target, c, chip)).toMatchObject({ values: [{ optionId: c.inUse }] });

    removePart(target.db.db, board, chip);
    expect(availability(target, c, chip)).toMatchObject({ state: 'unavailable' });

    addPart(target.db.db, shelf, chip);
    expect(availability(target, c, chip)).toMatchObject({ values: [{ optionId: c.loose }] });
  });

  it('moves every descendant when an intermediate part leaves its assembly', async () => {
    const { target, c, computer, board, chip } = await chain();
    expect(availability(target, c, chip)).toMatchObject({ values: [{ optionId: c.inUse }] });

    removePart(target.db.db, computer, board);

    expect(availability(target, c, board)).toMatchObject({ state: 'unavailable' });
    expect(availability(target, c, chip)).toMatchObject({ state: 'unavailable' });
  });

  it('re-sends every part in the chain when the assembly changes', async () => {
    const { target, c, computer, board, chip } = await chain();
    const since = await highWater(target);

    await setAvailability(target, c, computer, 2, c.loose);

    const feed = await changesSince(target, since);
    expect(feed.items.map((item) => item.id).toSorted()).toEqual(
      [board, chip, computer].toSorted()
    );
    for (const part of [board, chip])
      expect(computed(row(feed, part), c.availabilityFieldId)).toMatchObject({
        values: [{ optionId: c.loose }],
      });
    expect(availability(target, c, chip)).toMatchObject({ values: [{ optionId: c.loose }] });
  });

  it('reports a deleted assembly as deleted rather than as no assembly', async () => {
    const { target, c, board, chip } = await chain();

    await apply(
      target,
      wireMutation('item.delete', board, {}, { baseRevision: 1, catalogueRevision: c.revision })
    );

    expect(availability(target, c, chip)).toMatchObject({
      state: 'unavailable',
      reason: 'reference_deleted',
      traversedItemIds: [chip, board],
    });
  });

  it('refuses an assembly read below expression version 3', () => {
    h = openSyncHarness(transport);
    const db = h.db.db;
    const { draft, thingTypeId, conditionFieldId } = thingDraft(db);

    expect(() =>
      patchCatalogueDraft(db, target(draft), [
        computedAvailability(thingTypeId, { reads: conditionFieldId }, 2),
      ])
    ).toThrow(
      expect.objectContaining({
        issues: [expect.objectContaining({ code: 'expression_op_unknown', path: 'expression.op' })],
      })
    );
  });
});
