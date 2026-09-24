/**
 * `coalesce` end to end: it publishes under the active protocol-2 minimum,
 * and a value that exists only because an input is absent goes stale, and is
 * re-sent, when that input appears.
 */
import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import { activatePersistedCatalogueProtocol } from '../../catalogue/__tests__/protocol-rollout-fixture.js';
import {
  createCatalogueDraft,
  patchCatalogueDraft,
  publishCatalogueDraft,
} from '../../catalogue/authoring.js';
import { SyncItemSchema } from '../../contract/rest-sync-schemas.js';
import { readMinimumProtocol } from '../../protocol/rollout.js';
import {
  openSyncHarness,
  PROTOCOL_2,
  send,
  wireMutation,
  type SyncHarness,
} from './sync-harness.js';
import { createTestTransport } from './test-http.js';

import type { CatalogueDescriptor } from '../../catalogue/authoring-types.js';
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
  readonly partTypeId: string;
  readonly weightFieldId: string;
  readonly kitTypeId: string;
  readonly partFieldId: string;
  readonly bestFieldId: string;
}

function target(draft: CatalogueDescriptor) {
  return {
    revision: draft.revision.revision,
    baseRevision: 1,
    expectedDraftVersion: draft.revision.draftVersion,
  };
}

function find(draft: CatalogueDescriptor, key: string, fieldKey?: string): string {
  const type = draft.types.find((entry) => entry.key === key);
  const id = fieldKey === undefined ? type?.id : type?.fields.find((f) => f.key === fieldKey)?.id;
  if (id === undefined) throw new Error(`${key}.${fieldKey ?? ''} was not created`);
  return id;
}

/** A part with an optional weight, and a kit whose `best` is `coalesce(part.weight, 0)`. */
function publish(db: CommandDb): Ids {
  activatePersistedCatalogueProtocol(db);
  const created = createCatalogueDraft(db, 1, AUTHOR);
  const types = patchCatalogueDraft(db, target(created), [
    { kind: 'put_type', key: 'part', label: 'Part' },
    { kind: 'put_type', key: 'kit', label: 'Kit' },
  ]).draft;
  const partTypeId = find(types, 'part');
  const kitTypeId = find(types, 'kit');
  const stored = patchCatalogueDraft(db, target(types), [
    {
      kind: 'put_field',
      typeId: partTypeId,
      key: 'weight',
      label: 'Weight',
      fieldKind: 'integer',
      cardinality: 'one',
      required: false,
      storage: 'stored',
    },
    {
      kind: 'put_field',
      typeId: kitTypeId,
      key: 'part',
      label: 'Part',
      fieldKind: 'reference',
      cardinality: 'one',
      required: false,
      storage: 'stored',
      referenceKinds: ['item'],
      referenceTypeIds: [partTypeId],
    },
  ]).draft;
  const weightFieldId = find(stored, 'part', 'weight');
  const partFieldId = find(stored, 'kit', 'part');
  const withBest = patchCatalogueDraft(db, target(stored), [
    {
      kind: 'put_field',
      typeId: kitTypeId,
      key: 'best',
      label: 'Best',
      fieldKind: 'integer',
      cardinality: 'one',
      required: false,
      storage: 'computed',
      expressionVersion: 1,
      expression: {
        op: 'coalesce',
        values: [
          { op: 'read', path: [partFieldId], fieldId: weightFieldId },
          { op: 'literal', value: 0 },
        ],
      },
      allowOverride: false,
    },
  ]).draft;
  publishCatalogueDraft(
    db,
    created.revision.revision,
    { baseRevision: 1, expectedDraftVersion: withBest.revision.draftVersion, note: null },
    AUTHOR
  );
  return {
    revision: created.revision.revision,
    partTypeId,
    weightFieldId,
    kitTypeId,
    partFieldId,
    bestFieldId: find(withBest, 'kit', 'best'),
  };
}

async function apply(
  target: SyncHarness,
  mutation: ReturnType<typeof wireMutation>
): Promise<void> {
  const response = await send(target.api, [mutation], PROTOCOL_2);
  expect(response.body.outcomes[0]).toMatchObject({ status: 'applied' });
}

async function kitBest(target: SyncHarness, kitId: string, bestFieldId: string) {
  const response = await target.api.get('/sync/snapshot').set(PROTOCOL_2).query({ limit: 500 });
  const kit = SyncItemSchema.array()
    .parse(response.body.items)
    .find((item) => item.id === kitId);
  return kit?.computedValues.find((entry) => entry.fieldId === bestFieldId);
}

describe('coalesce', () => {
  it('publishes under the protocol-2 minimum, which protocol-2 phones can carry opaquely', () => {
    const harness = openSyncHarness(transport);
    h = harness;
    activatePersistedCatalogueProtocol(harness.db.db);
    const active = readMinimumProtocol(harness.db.db);
    expect(() => publish(harness.db.db)).not.toThrow();
    expect(readMinimumProtocol(harness.db.db)).toBe(active);
  });

  it('falls back while an input is absent and re-evaluates when it appears', async () => {
    h = openSyncHarness(transport);
    const ids = publish(h.db.db);
    const partId = randomUUID();
    const kitId = randomUUID();
    await apply(
      h,
      wireMutation(
        'item.create',
        partId,
        { item: { name: 'Part', typeId: ids.partTypeId, values: [] } },
        { catalogueRevision: ids.revision }
      )
    );
    await apply(
      h,
      wireMutation(
        'item.create',
        kitId,
        {
          item: {
            name: 'Kit',
            typeId: ids.kitTypeId,
            values: [
              { fieldId: ids.partFieldId, values: [{ targetKind: 'item', targetId: partId }] },
            ],
          },
        },
        { catalogueRevision: ids.revision }
      )
    );

    const fallback = await kitBest(h, kitId, ids.bestFieldId);
    expect(fallback).toMatchObject({ state: 'ok', values: [0] });
    expect(fallback?.dependencies).toContainEqual({
      itemId: partId,
      fieldId: ids.weightFieldId,
      revision: 1,
    });

    await apply(
      h,
      wireMutation(
        'item.edit',
        partId,
        { values: [{ fieldId: ids.weightFieldId, values: [4] }] },
        { baseRevision: 1, catalogueRevision: ids.revision }
      )
    );

    expect(await kitBest(h, kitId, ids.bestFieldId)).toMatchObject({ state: 'ok', values: [4] });
  });
});
