/**
 * S2 — a published type evolves while items already use it: a compatible
 * rename, an archived field, a retired enum option, and a change that needs
 * a declared value migration, each published through MCP. Existing values
 * must survive every step, and the audit trail must record each publication.
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
  type Descriptor,
  type DescriptorField,
  type DescriptorType,
} from './test-helpers-acceptance-mcp.js';
import { startAcceptanceStack, type AcceptanceStack } from './test-helpers-acceptance-stack.js';

const auditSchema = z.object({
  events: z.array(z.object({ kind: z.string(), revision: z.number().int() })),
});

function optionId(field: DescriptorField, key: string): string {
  const found = field.enumOptions.find((option) => option.key === key);
  if (found === undefined) throw new Error(`field ${field.key} has no option ${key}`);
  return found.id;
}

describe('S2 evolve a published type via MCP', () => {
  let stack: AcceptanceStack;
  let published: Descriptor;
  let lamp: DescriptorType;
  const withSize = randomUUID();
  const withoutSize = randomUUID();
  const revisions = new Map<string, number>();

  async function publishNext(
    operations: readonly Record<string, unknown>[],
    note: string
  ): Promise<Descriptor> {
    const draft = await DraftSession.open();
    await draft.patch(operations);
    published = await draft.mustPublish({ note });
    lamp = typeByKey(published, 'acc_lamp');
    return published;
  }

  beforeAll(async () => {
    stack = await startAcceptanceStack(import.meta.url);
    await stack.activateProtocol2();
    const draft = await DraftSession.open();
    await draft.patch([{ kind: 'put_type', key: 'acc_lamp', label: 'Acceptance lamp' }]);
    const typeId = typeByKey(draft.descriptor, 'acc_lamp').id;
    const stored = (key: string, fieldKind: string) => ({
      kind: 'put_field',
      typeId,
      key,
      label: key,
      fieldKind,
      cardinality: 'one',
      required: false,
      storage: 'stored',
    });
    await draft.patch([
      stored('wattage', 'integer'),
      stored('legacy_code', 'short_text'),
      stored('tone', 'enum'),
      stored('size', 'short_text'),
    ]);
    const tone = fieldByKey(typeByKey(draft.descriptor, 'acc_lamp'), 'tone');
    await draft.patch(
      ['warm', 'cool', 'amber'].map((key) => ({
        kind: 'put_enum_option',
        fieldId: tone.id,
        key,
        label: key,
      }))
    );
    published = await draft.mustPublish({ minimumProtocol: 2, note: 'S2 base' });
    lamp = typeByKey(published, 'acc_lamp');
    const toneField = fieldByKey(lamp, 'tone');
    for (const [id, size] of [
      [withSize, 'L'],
      [withoutSize, null],
    ] as const) {
      const revision = await mutateItem('inventory.items.create', {
        itemName: `Lamp ${id.slice(0, 4)}`,
        entityId: id,
        catalogueRevision: published.revision.revision,
        typeId: lamp.id,
        fieldValues: [
          { fieldId: fieldByKey(lamp, 'wattage').id, values: [40] },
          { fieldId: fieldByKey(lamp, 'legacy_code').id, values: ['OLD-1'] },
          { fieldId: toneField.id, values: [{ optionId: optionId(toneField, 'amber') }] },
          ...(size === null ? [] : [{ fieldId: fieldByKey(lamp, 'size').id, values: [size] }]),
        ],
      });
      revisions.set(id, revision);
    }
  });

  afterAll(async () => {
    await stack.stop();
  });

  it('S2.1 a compatible rename publishes without a migration and leaves values and IDs intact', async () => {
    stack.seam.useDefaultKey();
    const wattage = fieldByKey(lamp, 'wattage');
    await publishNext(
      [{ kind: 'put_field', id: wattage.id, typeId: lamp.id, label: 'Power draw' }],
      'S2 rename'
    );
    const renamed = fieldByKey(lamp, 'wattage');
    expect(renamed.id).toBe(wattage.id);
    expect(renamed.label).toBe('Power draw');
    const item = await getItem(withSize);
    expect(storedValues(item, wattage.id)).toEqual([40]);
    expect(item.revision).toBe(revisions.get(withSize));
  });

  it('S2.2 archiving a field keeps its existing values readable and refuses new writes to it', async () => {
    stack.seam.useDefaultKey();
    const legacy = fieldByKey(lamp, 'legacy_code');
    await publishNext([{ kind: 'archive_field', id: legacy.id }], 'S2 archive field');
    expect(fieldByKey(lamp, 'legacy_code').archivedAt).not.toBeNull();
    const item = await getItem(withSize);
    expect(storedValues(item, legacy.id)).toEqual(['OLD-1']);

    const refused = await mustRefuse('inventory.items.update', {
      id: withSize,
      revision: item.revision,
      catalogueRevision: published.revision.revision,
      fieldValues: [{ fieldId: legacy.id, values: ['OLD-2'] }],
    });
    expect(refused).toMatch(/can only retain its existing values/);
    expect(storedValues(await getItem(withSize), legacy.id)).toEqual(['OLD-1']);
  });

  it('S2.3 retiring an enum option keeps it on existing items and refuses it on a new one', async () => {
    stack.seam.useDefaultKey();
    const tone = fieldByKey(lamp, 'tone');
    const amber = optionId(tone, 'amber');
    await publishNext([{ kind: 'archive_enum_option', id: amber }], 'S2 retire option');
    const retired = fieldByKey(lamp, 'tone').enumOptions.find((option) => option.id === amber);
    expect(retired?.archivedAt).not.toBeNull();
    expect(storedValues(await getItem(withSize), tone.id)).toEqual([{ optionId: amber }]);

    const refused = await mustRefuse('inventory.items.create', {
      itemName: 'Lamp with a retired tone',
      entityId: randomUUID(),
      catalogueRevision: published.revision.revision,
      typeId: lamp.id,
      fieldValues: [{ fieldId: tone.id, values: [{ optionId: amber }] }],
    });
    expect(refused).toMatch(new RegExp(`enum option ${amber} is archived`));
  });

  it('S2.4 a migration_required change is refused without a migration and applied with a declared one', async () => {
    stack.seam.useDefaultKey();
    const size = fieldByKey(lamp, 'size');
    const draft = await DraftSession.open();
    await draft.patch([{ kind: 'put_field', id: size.id, typeId: lamp.id, required: true }]);

    const refused = await draft.publish();
    expect(refused.ok).toBe(false);
    expect(refused.ok ? '' : refused.message).toMatch(/catalogue_migration_required/);

    const after = await draft.mustPublish({
      note: 'S2 require size',
      migration: {
        name: 'acceptance-default-lamp-size',
        fromRevision: draft.baseRevision,
        toRevision: draft.revision,
        affectedTypeIds: [lamp.id],
        affectedFieldIds: [size.id],
        steps: [{ kind: 'set_default', fieldId: size.id, values: ['M'] }],
      },
    });
    published = after;
    lamp = typeByKey(after, 'acc_lamp');
    expect(storedValues(await getItem(withoutSize), size.id)).toEqual(['M']);
    expect(storedValues(await getItem(withSize), size.id)).toEqual(['L']);
  });

  it('S2.5 the catalogue audit records every publication, newest first, with its migration', async () => {
    stack.seam.useDefaultKey();
    const body = await mustCall('inventory.catalogue.audit', {});
    const audit = auditSchema.parse(body);
    const publications = audit.events.filter((event) => event.kind === 'published');
    expect(publications.map((event) => event.revision)).toEqual(
      publications.map((event) => event.revision).toSorted((a, b) => b - a)
    );
    expect(publications[0]?.revision).toBe(published.revision.revision);
    const text = JSON.stringify(body);
    for (const note of ['S2 base', 'S2 rename', 'S2 archive field', 'S2 retire option']) {
      expect(text).toContain(note);
    }
    expect(text).toContain('acceptance-default-lamp-size');
    expect(text.indexOf('S2 require size')).toBeLessThan(text.indexOf('S2 base'));
  });
});
