/**
 * S1 — an agent authors a user-defined type and manages its items entirely
 * through the inventory MCP tools, and the result is what Inventory's REST
 * surface and a paired phone's BFM sync both see.
 *
 * Every field kind the catalogue offers is exercised, including a reference
 * that may point at an item or a location and an ordered `many` reference
 * whose order must survive a round trip.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  DraftSession,
  fieldByKey,
  getItem,
  mustCall,
  mustRefuse,
  mutateItem,
  storedValues,
  typeByKey,
  type DescriptorType,
} from './test-helpers-acceptance-mcp.js';
import { startAcceptanceStack, type AcceptanceStack } from './test-helpers-acceptance-stack.js';

const locationSchema = z.union([
  z.object({ id: z.string() }),
  z.object({ data: z.object({ id: z.string() }) }),
]);

const syncItemSchema = z.object({
  id: z.string(),
  typeId: z.string().nullable(),
  catalogueRevision: z.number().nullable(),
  deletedAt: z.string().nullable(),
  fieldValues: z.array(z.object({ fieldId: z.string(), values: z.array(z.unknown()) })),
});
const snapshotSchema = z.object({
  epoch: z.string(),
  highWaterSeq: z.number().int(),
  minimumProtocol: z.number().int(),
  items: z.array(syncItemSchema),
});
const changesSchema = z.object({ items: z.array(syncItemSchema), minimumProtocol: z.number() });
const mobileCatalogueSchema = z.object({
  revision: z.object({ minimumProtocol: z.number() }),
  types: z.array(
    z.object({ id: z.string(), key: z.string(), fields: z.array(z.object({ id: z.string() })) })
  ),
});

const PRIMITIVE_KINDS = [
  'short_text',
  'long_text',
  'integer',
  'decimal',
  'boolean',
  'enum',
  'measurement',
  'date',
  'date_time',
  'url',
  'reference',
] as const;

const STORED_FIELDS = [
  { key: 'serial', fieldKind: 'short_text' },
  { key: 'notes', fieldKind: 'long_text' },
  { key: 'ports', fieldKind: 'integer' },
  { key: 'weight', fieldKind: 'decimal' },
  { key: 'wireless', fieldKind: 'boolean' },
  { key: 'finish', fieldKind: 'enum' },
  { key: 'depth', fieldKind: 'measurement', fixedUnit: 'cm' },
  { key: 'bought_on', fieldKind: 'date' },
  { key: 'last_seen', fieldKind: 'date_time' },
  { key: 'manual', fieldKind: 'url' },
  { key: 'paired_with', fieldKind: 'reference', referenceKinds: ['item', 'location'] },
  {
    key: 'route',
    fieldKind: 'reference',
    cardinality: 'many',
    referenceKinds: ['item', 'location'],
  },
  { key: 'tags', fieldKind: 'short_text', cardinality: 'many' },
] as const;

const webItemSchema = z.object({ item: syncItemSchema.pick({ typeId: true, fieldValues: true }) });
const itemTombstoneSchema = z.object({ item: z.object({ deletedAt: z.string().nullable() }) });

/** A reference value as Inventory answers it for a target that exists. */
function resolved(value: unknown): unknown {
  return typeof value === 'object' && value !== null
    ? { ...value, targetState: 'resolved' }
    : value;
}

function locationId(body: unknown): string {
  const parsed = locationSchema.parse(body);
  return 'id' in parsed ? parsed.id : parsed.data.id;
}

describe('S1 author a type and manage its items via MCP', () => {
  let stack: AcceptanceStack;
  let gadget: DescriptorType;
  let widget: DescriptorType;
  let catalogueRevision: number;
  let shelfId: string;
  let peerItemId: string;
  const itemId = randomUUID();
  let itemRevision = 0;

  beforeAll(async () => {
    stack = await startAcceptanceStack(import.meta.url, { bfm: true });
  });

  afterAll(async () => {
    await stack.stop();
  });

  it('S1.1 authors every primitive kind in a draft, previews it, and publishes at protocol 2 only after the rollout is activated', async () => {
    stack.seam.useDefaultKey();
    const draft = await DraftSession.open();
    await draft.patch([
      { kind: 'put_type', key: 'acc_gadget', label: 'Acceptance gadget' },
      { kind: 'put_type', key: 'acc_widget', label: 'Acceptance widget' },
    ]);
    const gadgetId = typeByKey(draft.descriptor, 'acc_gadget').id;
    const widgetId = typeByKey(draft.descriptor, 'acc_widget').id;
    await draft.patch(
      STORED_FIELDS.map((field) => ({
        kind: 'put_field',
        typeId: gadgetId,
        label: field.key,
        cardinality: 'one',
        required: false,
        storage: 'stored',
        ...field,
      }))
    );
    await draft.patch([
      {
        kind: 'put_field',
        typeId: widgetId,
        key: 'colour',
        label: 'Colour',
        fieldKind: 'short_text',
        cardinality: 'one',
        required: true,
        storage: 'stored',
      },
    ]);
    const finish = fieldByKey(typeByKey(draft.descriptor, 'acc_gadget'), 'finish');
    await draft.patch([
      { kind: 'put_enum_option', fieldId: finish.id, key: 'matte', label: 'Matte' },
      { kind: 'put_enum_option', fieldId: finish.id, key: 'gloss', label: 'Gloss' },
    ]);

    const versionBeforePreview = draft.version;
    const preview = await draft.preview([
      { kind: 'put_type', id: gadgetId, label: 'Acceptance gadget' },
    ]);
    expect(preview.ok, preview.ok ? '' : preview.message).toBe(true);
    const resumed = await DraftSession.resume(draft.baseRevision);
    expect(resumed.version).toBe(versionBeforePreview);

    const refused = await draft.publish({ minimumProtocol: 2 });
    expect(refused.ok).toBe(false);
    expect(refused.ok ? '' : refused.message).toMatch(/protocol_rollout_required/);

    await stack.activateProtocol2();
    const published = await draft.mustPublish({ minimumProtocol: 2, note: 'S1 acceptance' });
    expect(published.revision.minimumProtocol).toBe(2);
    catalogueRevision = published.revision.revision;
    gadget = typeByKey(published, 'acc_gadget');
    widget = typeByKey(published, 'acc_widget');
    expect(new Set(gadget.fields.map((field) => field.kind))).toEqual(new Set(PRIMITIVE_KINDS));
    expect(fieldByKey(gadget, 'route').cardinality).toBe('many');
  });

  it('S1.2 creates an item carrying a value for every kind, with an ordered many-reference', async () => {
    stack.seam.useDefaultKey();
    shelfId = locationId(
      await mustCall('inventory.locations.create', { name: 'Acceptance shelf' })
    );
    peerItemId = randomUUID();
    await mutateItem('inventory.items.create', {
      itemName: 'Peer widget',
      entityId: peerItemId,
      catalogueRevision,
      typeId: widget.id,
      fieldValues: [{ fieldId: fieldByKey(widget, 'colour').id, values: ['red'] }],
    });

    const finish = fieldByKey(gadget, 'finish');
    const matte = finish.enumOptions.find((option) => option.key === 'matte');
    if (matte === undefined) throw new Error('matte option missing');
    const values: Record<string, unknown[]> = {
      serial: ['SN-001'],
      notes: ['A long\nmultiline note'],
      ports: [4],
      weight: ['1.25'],
      wireless: [true],
      finish: [{ optionId: matte.id }],
      depth: [{ amount: '12.5', unit: 'cm' }],
      bought_on: ['2026-09-01'],
      last_seen: ['2026-09-20T10:15:00.000Z'],
      manual: ['https://example.com/manual.pdf'],
      paired_with: [{ targetKind: 'item', targetId: peerItemId }],
      route: [
        { targetKind: 'location', targetId: shelfId },
        { targetKind: 'item', targetId: peerItemId },
      ],
      tags: ['b', 'a', 'c'],
    };
    itemRevision = await mutateItem('inventory.items.create', {
      itemName: 'Acceptance gadget one',
      entityId: itemId,
      catalogueRevision,
      typeId: gadget.id,
      fieldValues: Object.entries(values).map(([key, entry]) => ({
        fieldId: fieldByKey(gadget, key).id,
        values: entry,
      })),
    });

    const item = await getItem(itemId);
    expect(item.typeId).toBe(gadget.id);
    for (const [key, entry] of Object.entries(values)) {
      const expected = fieldByKey(gadget, key).kind === 'reference' ? entry.map(resolved) : entry;
      expect(storedValues(item, fieldByKey(gadget, key).id), key).toEqual(expected);
    }

    const rest = await stack.inventory(`/web/items/${itemId}`);
    expect(rest.status).toBe(200);
    const restItem = webItemSchema.parse(rest.body).item;
    expect(restItem.typeId).toBe(gadget.id);
    expect(
      restItem.fieldValues.find((entry) => entry.fieldId === fieldByKey(gadget, 'tags').id)?.values
    ).toEqual(['b', 'a', 'c']);
  });

  it('S1.3 edits values, reorders the many-reference and clears an optional field', async () => {
    stack.seam.useDefaultKey();
    const route = fieldByKey(gadget, 'route').id;
    const notes = fieldByKey(gadget, 'notes').id;
    itemRevision = await mutateItem('inventory.items.update', {
      id: itemId,
      revision: itemRevision,
      catalogueRevision,
      fieldValues: [
        {
          fieldId: route,
          values: [
            { targetKind: 'item', targetId: peerItemId },
            { targetKind: 'location', targetId: shelfId },
          ],
        },
        { fieldId: notes, values: null },
        { fieldId: fieldByKey(gadget, 'ports').id, values: [8] },
      ],
    });

    const item = await getItem(itemId);
    expect(storedValues(item, route)).toEqual([
      resolved({ targetKind: 'item', targetId: peerItemId }),
      resolved({ targetKind: 'location', targetId: shelfId }),
    ]);
    expect(storedValues(item, notes)).toBeUndefined();
    expect(storedValues(item, fieldByKey(gadget, 'ports').id)).toEqual([8]);

    const stale = await mustRefuse('inventory.items.update', {
      id: itemId,
      revision: itemRevision - 1,
      catalogueRevision,
      fieldValues: [{ fieldId: fieldByKey(gadget, 'ports').id, values: [9] }],
    });
    expect(stale).toMatch(/conflict/i);
  });

  it('S1.4 the paired phone syncs the published type and the item through BFM', async () => {
    const bfm = stack.bfm;
    if (bfm === undefined) throw new Error('BFM did not start');
    const catalogue = await bfm.get(
      `/mobile/inventory/type-catalogue?revision=${String(catalogueRevision)}`
    );
    expect(catalogue.status).toBe(200);
    const phoneCatalogue = mobileCatalogueSchema.parse(catalogue.body);
    expect(phoneCatalogue.revision.minimumProtocol).toBe(2);
    const phoneGadget = phoneCatalogue.types.find((type) => type.id === gadget.id);
    expect(phoneGadget?.fields.map((field) => field.id).toSorted()).toEqual(
      gadget.fields.map((field) => field.id).toSorted()
    );

    const snapshot = await bfm.get('/mobile/inventory/sync/snapshot?limit=500');
    expect(snapshot.status).toBe(200);
    const page = snapshotSchema.parse(snapshot.body);
    expect(page.minimumProtocol).toBe(2);
    const synced = page.items.find((entry) => entry.id === itemId);
    expect(synced?.typeId).toBe(gadget.id);
    expect(
      synced?.fieldValues.find((entry) => entry.fieldId === fieldByKey(gadget, 'route').id)?.values
    ).toEqual([
      resolved({ targetKind: 'item', targetId: peerItemId }),
      resolved({ targetKind: 'location', targetId: shelfId }),
    ]);
  });

  it('S1.5 changes the item to another type, then deletes it, and the phone sees both', async () => {
    const bfm = stack.bfm;
    if (bfm === undefined) throw new Error('BFM did not start');
    stack.seam.useDefaultKey();
    const before = snapshotSchema.parse((await bfm.get('/mobile/inventory/sync/snapshot')).body);

    itemRevision = await mutateItem('inventory.items.changeType', {
      id: itemId,
      revision: itemRevision,
      catalogueRevision,
      typeId: widget.id,
      fieldValues: [{ fieldId: fieldByKey(widget, 'colour').id, values: ['blue'] }],
    });
    const changed = await getItem(itemId);
    expect(changed.typeId).toBe(widget.id);
    expect(storedValues(changed, fieldByKey(widget, 'colour').id)).toEqual(['blue']);
    expect(storedValues(changed, fieldByKey(gadget, 'serial').id)).toBeUndefined();

    await mutateItem('inventory.items.delete', { id: itemId, revision: itemRevision });
    const tombstone = itemTombstoneSchema.parse(
      await mustCall('inventory.items.get', { id: itemId })
    );
    expect(tombstone.item.deletedAt).not.toBeNull();

    const feed = await bfm.get(
      `/mobile/inventory/sync/changes?since=${String(before.highWaterSeq)}&epoch=${before.epoch}&limit=500`
    );
    expect(feed.status).toBe(200);
    const rows = changesSchema.parse(feed.body).items.filter((entry) => entry.id === itemId);
    const last = rows.at(-1);
    expect(last?.deletedAt).not.toBeNull();
  });
});
