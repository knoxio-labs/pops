/**
 * S3 — computed fields authored through MCP and evaluated end to end:
 * same-item arithmetic, `coalesce`, a two-hop reference read, overrides set
 * and cleared, a dependent item re-sent to the phone when something it reads
 * changes, and search over a computed value. Dimensional units (a volume from
 * width × height × depth) are exercised only when the build supports them.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  callTool,
  computedEntry,
  DraftSession,
  fieldByKey,
  getItem,
  mutateItem,
  typeByKey,
  type DescriptorType,
} from './test-helpers-acceptance-mcp.js';
import { skipCriterion } from './test-helpers-acceptance-skip.js';
import { startAcceptanceStack, type AcceptanceStack } from './test-helpers-acceptance-stack.js';

const read = (fieldId: string, path: readonly string[] = []) => ({ op: 'read', path, fieldId });

const feedSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      revision: z.number().int(),
      seq: z.number().int(),
      computedValues: z.array(
        z.object({
          fieldId: z.string(),
          state: z.string(),
          values: z.array(z.unknown()).optional(),
        })
      ),
    })
  ),
});
const snapshotHeadSchema = z.object({ epoch: z.string(), highWaterSeq: z.number().int() });
const measurementSchema = z.object({ amount: z.string(), unit: z.string() });
const searchSchema = z.object({ hits: z.array(z.object({ uri: z.string() })) });

/** The volume field every dimensional-units build must accept. */
function volumeField(typeId: string, width: string, height: string, depth: string) {
  return {
    kind: 'put_field',
    typeId,
    key: 'volume',
    label: 'Volume',
    fieldKind: 'measurement',
    fixedUnit: 'L',
    cardinality: 'one',
    required: false,
    storage: 'computed',
    allowOverride: false,
    expressionVersion: 1,
    expression: {
      op: 'multiply',
      left: { op: 'multiply', left: read(width), right: read(height) },
      right: read(depth),
    },
  };
}

describe('S3 computed fields end to end', () => {
  let stack: AcceptanceStack;
  let catalogueRevision: number;
  let site: DescriptorType;
  let rack: DescriptorType;
  let device: DescriptorType;
  const siteId = randomUUID();
  const rackId = randomUUID();
  const deviceId = randomUUID();
  const orphanId = randomUUID();
  let siteRevision = 0;
  let deviceRevision = 0;

  function computed(key: string): string {
    return fieldByKey(device, key).id;
  }

  beforeAll(async () => {
    stack = await startAcceptanceStack(import.meta.url, { bfm: true });
    await stack.activateProtocol2();
    const draft = await DraftSession.open();
    await draft.patch([
      { kind: 'put_type', key: 'acc_site', label: 'Acceptance site' },
      { kind: 'put_type', key: 'acc_rack', label: 'Acceptance rack' },
      { kind: 'put_type', key: 'acc_device', label: 'Acceptance device' },
    ]);
    const ids = {
      site: typeByKey(draft.descriptor, 'acc_site').id,
      rack: typeByKey(draft.descriptor, 'acc_rack').id,
      device: typeByKey(draft.descriptor, 'acc_device').id,
    };
    const stored = (typeId: string, key: string, fieldKind: string, extra = {}) => ({
      kind: 'put_field',
      typeId,
      key,
      label: key,
      fieldKind,
      cardinality: 'one',
      required: false,
      storage: 'stored',
      ...extra,
    });
    await draft.patch([
      stored(ids.site, 'postcode', 'short_text'),
      stored(ids.rack, 'rack_label', 'short_text'),
      stored(ids.rack, 'site', 'reference', {
        referenceKinds: ['item'],
        referenceTypeIds: [ids.site],
      }),
      stored(ids.device, 'price', 'integer'),
      stored(ids.device, 'discount', 'integer'),
      stored(ids.device, 'rack', 'reference', {
        referenceKinds: ['item'],
        referenceTypeIds: [ids.rack],
      }),
    ]);
    const fieldId = (typeKey: string, key: string) =>
      fieldByKey(typeByKey(draft.descriptor, typeKey), key).id;
    const computedField = (key: string, fieldKind: string, expression: unknown, extra = {}) => ({
      kind: 'put_field',
      typeId: ids.device,
      key,
      label: key,
      fieldKind,
      cardinality: 'one',
      required: false,
      storage: 'computed',
      allowOverride: false,
      expressionVersion: 1,
      expression,
      ...extra,
    });
    const viaRack = [fieldId('acc_device', 'rack')];
    const viaSite = [fieldId('acc_device', 'rack'), fieldId('acc_rack', 'site')];
    await draft.patch([
      computedField(
        'net',
        'integer',
        {
          op: 'subtract',
          left: read(fieldId('acc_device', 'price')),
          right: {
            op: 'coalesce',
            values: [read(fieldId('acc_device', 'discount')), { op: 'literal', value: 0 }],
          },
        },
        { allowOverride: true }
      ),
      computedField('site_postcode', 'short_text', read(fieldId('acc_site', 'postcode'), viaSite)),
      computedField('locator', 'short_text', {
        op: 'concat',
        left: read(fieldId('acc_rack', 'rack_label'), viaRack),
        right: read(fieldId('acc_site', 'postcode'), viaSite),
      }),
    ]);
    const published = await draft.mustPublish({ minimumProtocol: 2, note: 'S3 computed' });
    catalogueRevision = published.revision.revision;
    site = typeByKey(published, 'acc_site');
    rack = typeByKey(published, 'acc_rack');
    device = typeByKey(published, 'acc_device');

    siteRevision = await mutateItem('inventory.items.create', {
      itemName: 'Acceptance site',
      entityId: siteId,
      catalogueRevision,
      typeId: site.id,
      fieldValues: [{ fieldId: fieldByKey(site, 'postcode').id, values: ['QX71'] }],
    });
    await mutateItem('inventory.items.create', {
      itemName: 'Acceptance rack',
      entityId: rackId,
      catalogueRevision,
      typeId: rack.id,
      fieldValues: [
        { fieldId: fieldByKey(rack, 'rack_label').id, values: ['RK9'] },
        {
          fieldId: fieldByKey(rack, 'site').id,
          values: [{ targetKind: 'item', targetId: siteId }],
        },
      ],
    });
    deviceRevision = await mutateItem('inventory.items.create', {
      itemName: 'Acceptance device',
      entityId: deviceId,
      catalogueRevision,
      typeId: device.id,
      fieldValues: [
        { fieldId: fieldByKey(device, 'price').id, values: [120] },
        { fieldId: fieldByKey(device, 'discount').id, values: [20] },
        {
          fieldId: fieldByKey(device, 'rack').id,
          values: [{ targetKind: 'item', targetId: rackId }],
        },
      ],
    });
    await mutateItem('inventory.items.create', {
      itemName: 'Acceptance orphan device',
      entityId: orphanId,
      catalogueRevision,
      typeId: device.id,
      fieldValues: [{ fieldId: fieldByKey(device, 'price').id, values: [50] }],
    });
  });

  afterAll(async () => {
    await stack.stop();
  });

  it('S3.1 evaluates same-item arithmetic, coalesce and a two-hop reference read', async () => {
    stack.seam.useDefaultKey();
    const item = await getItem(deviceId);
    expect(computedEntry(item, computed('net'))).toMatchObject({ state: 'ok', values: [100] });
    expect(computedEntry(item, computed('site_postcode'))).toMatchObject({
      state: 'ok',
      values: ['QX71'],
    });
    expect(computedEntry(item, computed('locator'))).toMatchObject({
      state: 'ok',
      values: ['RK9QX71'],
    });

    const orphan = await getItem(orphanId);
    expect(computedEntry(orphan, computed('net'))).toMatchObject({ state: 'ok', values: [50] });
    expect(computedEntry(orphan, computed('site_postcode')).state).toBe('unavailable');
  });

  it('S3.2 an override replaces the computed value and clearing it resumes computation', async () => {
    stack.seam.useDefaultKey();
    deviceRevision = await mutateItem('inventory.items.setOverride', {
      id: deviceId,
      revision: deviceRevision,
      catalogueRevision,
      fieldId: computed('net'),
      value: 7,
    });
    expect(computedEntry(await getItem(deviceId), computed('net'))).toMatchObject({
      state: 'overridden',
      values: [7],
    });
    deviceRevision = await mutateItem('inventory.items.clearOverride', {
      id: deviceId,
      revision: deviceRevision,
      catalogueRevision,
      fieldId: computed('net'),
    });
    expect(computedEntry(await getItem(deviceId), computed('net'))).toMatchObject({
      state: 'ok',
      values: [100],
    });
  });

  it('S3.3 editing a two-hop dependency re-sends the dependent item to the phone at its own revision', async () => {
    const bfm = stack.bfm;
    if (bfm === undefined) throw new Error('BFM did not start');
    stack.seam.useDefaultKey();
    const head = snapshotHeadSchema.parse((await bfm.get('/mobile/inventory/sync/snapshot')).body);

    siteRevision = await mutateItem('inventory.items.update', {
      id: siteId,
      revision: siteRevision,
      catalogueRevision,
      fieldValues: [{ fieldId: fieldByKey(site, 'postcode').id, values: ['ZW44'] }],
    });

    const feed = await bfm.get(
      `/mobile/inventory/sync/changes?since=${String(head.highWaterSeq)}&epoch=${head.epoch}&limit=500`
    );
    expect(feed.status).toBe(200);
    const resent = feedSchema.parse(feed.body).items.find((entry) => entry.id === deviceId);
    expect(resent?.revision).toBe(deviceRevision);
    expect(resent?.seq).toBeGreaterThan(head.highWaterSeq);
    expect(
      resent?.computedValues.find((entry) => entry.fieldId === computed('locator'))
    ).toMatchObject({ state: 'ok', values: ['RK9ZW44'] });
  });

  it('S3.4 search finds the item by a computed value no stored field holds', async () => {
    const search = await stack.inventory('/search', { body: { query: { text: 'RK9ZW44' } } });
    expect(search.status).toBe(200);
    const uris = searchSchema.parse(search.body).hits.map((hit) => hit.uri);
    expect(uris.some((uri) => uri.endsWith(deviceId))).toBe(true);
    expect(uris.some((uri) => uri.endsWith(siteId) || uri.endsWith(rackId))).toBe(false);
  });

  it('S3.5 derives a volume from width × height × depth in dimensional units', async (context) => {
    stack.seam.useDefaultKey();
    const draft = await DraftSession.open();
    try {
      const stored = (key: string) => ({
        kind: 'put_field',
        typeId: device.id,
        key,
        label: key,
        fieldKind: 'measurement',
        fixedUnit: 'cm',
        cardinality: 'one',
        required: false,
        storage: 'stored',
      });
      await draft.patch([stored('width'), stored('height'), stored('depth')]);
      const draftDevice = typeByKey(draft.descriptor, 'acc_device');
      const probe = await draft.preview([
        volumeField(
          device.id,
          fieldByKey(draftDevice, 'width').id,
          fieldByKey(draftDevice, 'height').id,
          fieldByKey(draftDevice, 'depth').id
        ),
      ]);
      // A build without dimensional units types `cm × cm` as a mismatch at
      // exactly this node; any other refusal is a real failure.
      if (
        !probe.ok &&
        probe.message.includes('"path":"expression.left.right","code":"expression_type_mismatch"')
      ) {
        skipCriterion(
          context,
          'dimensional units are not on this build: multiplying two cm measurements is an expression_type_mismatch (lands with inventory-types/b3-dimensional-units)'
        );
      }
      expect(probe.ok, probe.ok ? '' : probe.message).toBe(true);
      await draft.patch([
        volumeField(
          device.id,
          fieldByKey(draftDevice, 'width').id,
          fieldByKey(draftDevice, 'height').id,
          fieldByKey(draftDevice, 'depth').id
        ),
      ]);
      const published = await draft.mustPublish({ note: 'S3 volume' });
      const withVolume = typeByKey(published, 'acc_device');
      const boxId = randomUUID();
      await mutateItem('inventory.items.create', {
        itemName: 'Acceptance box',
        entityId: boxId,
        catalogueRevision: published.revision.revision,
        typeId: withVolume.id,
        fieldValues: [
          { fieldId: fieldByKey(withVolume, 'width').id, values: [{ amount: '10', unit: 'cm' }] },
          { fieldId: fieldByKey(withVolume, 'height').id, values: [{ amount: '20', unit: 'cm' }] },
          { fieldId: fieldByKey(withVolume, 'depth').id, values: [{ amount: '30', unit: 'cm' }] },
        ],
      });
      const volume = computedEntry(await getItem(boxId), fieldByKey(withVolume, 'volume').id);
      expect(volume.state).toBe('ok');
      const [litres] = z.array(measurementSchema).length(1).parse(volume.values);
      expect(litres?.unit).toBe('L');
      expect(Number(litres?.amount)).toBe(6);
    } finally {
      await callTool('inventory.catalogue.abandonDraft', {
        revision: draft.revision,
        baseRevision: draft.baseRevision,
        expectedDraftVersion: draft.version,
      });
    }
  });
});
