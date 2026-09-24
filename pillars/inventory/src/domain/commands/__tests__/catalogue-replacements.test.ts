/**
 * A change authored against a revision older than the active one is moved
 * onto the recorded replacement of a definition archived since, when the
 * replacement accepts its values as they are; otherwise the refusal names the
 * replacement (POPS-4494 decision 3).
 */
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  createCatalogueDraft,
  patchCatalogueDraft,
  publishCatalogueDraft,
} from '../../../catalogue/authoring.js';
import { mutation, openHarness } from './test-utils.js';

import type { DraftOperation } from '../../../catalogue/authoring-types.js';
import type { Harness } from './test-utils.js';

const AUTHOR = { kind: 'web', id: 'owner', label: 'Owner' } as const;
const STORED = { cardinality: 'one', required: false, storage: 'stored' } as const;

type Draft = ReturnType<typeof patchCatalogueDraft>['draft'];

function publish(
  harness: Harness,
  baseRevision: number,
  operations: (draft: Draft) => DraftOperation[]
): { readonly revision: number; readonly draft: Draft } {
  const created = createCatalogueDraft(harness.db, baseRevision, AUTHOR);
  const revision = created.revision.revision;
  const target = { revision, baseRevision, expectedDraftVersion: created.revision.draftVersion };
  const { draft } = patchCatalogueDraft(harness.db, target, operations(created));
  publishCatalogueDraft(
    harness.db,
    revision,
    { baseRevision, expectedDraftVersion: draft.revision.draftVersion, note: null },
    AUTHOR
  );
  return { revision, draft };
}

function idOf(draft: Draft, key: string): string {
  const type = draft.types.find((entry) => entry.key === key);
  const field = draft.types.flatMap((entry) => entry.fields).find((entry) => entry.key === key);
  const id = type?.id ?? field?.id;
  if (id === undefined) throw new Error(`no definition ${key}`);
  return id;
}

const GRAMS = { amount: '12.5', unit: 'g' };

/** `probe` with a `serial` text field and a `weight` in grams. */
function publishProbe(harness: Harness): { revision: number; draft: Draft } {
  const typed = publish(harness, 1, () => [{ kind: 'put_type', key: 'probe', label: 'Probe' }]);
  const probe = idOf(typed.draft, 'probe');
  return publish(harness, typed.revision, () => [
    {
      kind: 'put_field',
      typeId: probe,
      key: 'serial',
      label: 'Serial',
      fieldKind: 'short_text',
      ...STORED,
    },
    {
      kind: 'put_field',
      typeId: probe,
      key: 'weight',
      label: 'Weight',
      fieldKind: 'measurement',
      fixedUnit: 'g',
      ...STORED,
    },
  ]);
}

/** Replaces `serial` with a text field and `weight` with a measurement in kilograms. */
function replaceFields(
  harness: Harness,
  base: number
): { revision: number; draft: Draft; added: number } {
  const added = publish(harness, base, (draft) => [
    {
      kind: 'put_field',
      typeId: idOf(draft, 'probe'),
      key: 'serial_number',
      label: 'Serial number',
      fieldKind: 'short_text',
      ...STORED,
    },
    {
      kind: 'put_field',
      typeId: idOf(draft, 'probe'),
      key: 'mass',
      label: 'Mass',
      fieldKind: 'measurement',
      fixedUnit: 'kg',
      ...STORED,
    },
  ]);
  const archived = publish(harness, added.revision, (draft) => [
    { kind: 'archive_field', id: idOf(draft, 'serial'), replacedBy: idOf(draft, 'serial_number') },
    { kind: 'archive_field', id: idOf(draft, 'weight'), replacedBy: idOf(draft, 'mass') },
  ]);
  return { ...archived, added: added.revision };
}

function create(
  typeId: string,
  revision: number,
  values: { fieldId: string; values: unknown[] }[],
  id = randomUUID()
) {
  return mutation(
    'item.create',
    id,
    { item: { name: 'Probe', typeId, values } },
    { baseRevision: null, catalogueRevision: revision }
  );
}

function edit(
  itemId: string,
  revision: number,
  values: { fieldId: string; values: unknown[] | null }[]
) {
  return mutation('item.edit', itemId, { values }, { catalogueRevision: revision });
}

function storedValues(harness: Harness, itemId: string): Record<string, unknown> {
  const rows = harness.raw
    .prepare(
      'SELECT field_id, value_json FROM item_field_values WHERE item_id = ? ORDER BY field_id'
    )
    .all(itemId) as { field_id: string; value_json: string }[];
  return Object.fromEntries(rows.map((row) => [row.field_id, JSON.parse(row.value_json)]));
}

describe('moving a rebased change onto a replacement', () => {
  it('moves a new item value onto a replacement of the same shape', () => {
    const harness = openHarness();
    const probe = publishProbe(harness);
    const queued = create(idOf(probe.draft, 'probe'), probe.revision, [
      { fieldId: idOf(probe.draft, 'serial'), values: ['SN-1'] },
    ]);
    const replaced = replaceFields(harness, probe.revision);

    const outcome = harness.run(queued);

    expect(outcome, JSON.stringify(outcome)).toMatchObject({ status: 'applied' });
    expect(storedValues(harness, queued.entityId)).toEqual({
      [idOf(replaced.draft, 'serial_number')]: 'SN-1',
    });
  });

  it('moves an edit onto the replacement and keeps the archived value as history', () => {
    const harness = openHarness();
    const probe = publishProbe(harness);
    const itemId = randomUUID();
    const serial = idOf(probe.draft, 'serial');
    expect(
      harness.run(
        create(
          idOf(probe.draft, 'probe'),
          probe.revision,
          [{ fieldId: serial, values: ['SN-1'] }],
          itemId
        )
      )
    ).toMatchObject({ status: 'applied' });
    const queued = edit(itemId, probe.revision, [{ fieldId: serial, values: ['SN-2'] }]);
    const replaced = replaceFields(harness, probe.revision);
    const serialNumber = idOf(replaced.draft, 'serial_number');

    const outcome = harness.run(queued);

    expect(outcome).toMatchObject({ status: 'applied' });
    expect(storedValues(harness, itemId)).toEqual({ [serial]: 'SN-1', [serialNumber]: 'SN-2' });
    const edited = harness.eventsFor(itemId).find((event) => event.kind === 'edited');
    expect(edited?.after).toContain(serialNumber);
    expect(edited?.after).not.toContain(serial);
  });

  it('refuses a replacement in another unit and names it as the replacement', () => {
    const harness = openHarness();
    const probe = publishProbe(harness);
    const itemId = randomUUID();
    const weight = idOf(probe.draft, 'weight');
    harness.run(create(idOf(probe.draft, 'probe'), probe.revision, [], itemId));
    const queued = edit(itemId, probe.revision, [{ fieldId: weight, values: [GRAMS] }]);
    const replaced = replaceFields(harness, probe.revision);

    expect(harness.run(queued)).toMatchObject({
      status: 'rejected',
      reason: 'catalogue_repair_required',
      catalogueChanges: [
        {
          definition: 'field',
          id: weight,
          typeId: idOf(probe.draft, 'probe'),
          fieldId: weight,
          change: 'replaced',
          replacementId: idOf(replaced.draft, 'mass'),
          revision: replaced.revision,
        },
      ],
    });
    expect(storedValues(harness, itemId)).toEqual({});
  });

  it('refuses to move a value onto a replacement the change already writes', () => {
    const harness = openHarness();
    const probe = publishProbe(harness);
    const itemId = randomUUID();
    const serial = idOf(probe.draft, 'serial');
    harness.run(create(idOf(probe.draft, 'probe'), probe.revision, [], itemId));
    const replaced = replaceFields(harness, probe.revision);
    const serialNumber = idOf(replaced.draft, 'serial_number');
    const queued = edit(itemId, replaced.added, [
      { fieldId: serial, values: ['SN-old'] },
      { fieldId: serialNumber, values: ['SN-new'] },
    ]);

    const outcome = harness.run(queued);

    expect(outcome, JSON.stringify(outcome)).toMatchObject({
      reason: 'catalogue_repair_required',
      catalogueChanges: [{ id: serial, change: 'replaced', replacementId: serialNumber }],
    });
  });

  it('never moves a clear, which an archived field accepts as it is', () => {
    const harness = openHarness();
    const probe = publishProbe(harness);
    const itemId = randomUUID();
    const serial = idOf(probe.draft, 'serial');
    harness.run(
      create(
        idOf(probe.draft, 'probe'),
        probe.revision,
        [{ fieldId: serial, values: ['SN-1'] }],
        itemId
      )
    );
    const queued = edit(itemId, probe.revision, [{ fieldId: serial, values: null }]);
    replaceFields(harness, probe.revision);

    expect(harness.run(queued)).toMatchObject({ status: 'applied' });
    expect(storedValues(harness, itemId)).toEqual({});
  });

  it('leaves a value on a field its authored revision already had archived', () => {
    const harness = openHarness();
    const probe = publishProbe(harness);
    const itemId = randomUUID();
    const serial = idOf(probe.draft, 'serial');
    harness.run(
      create(
        idOf(probe.draft, 'probe'),
        probe.revision,
        [{ fieldId: serial, values: ['SN-1'] }],
        itemId
      )
    );
    const replaced = replaceFields(harness, probe.revision);
    const queued = edit(itemId, replaced.revision, [{ fieldId: serial, values: ['SN-1'] }]);
    publish(harness, replaced.revision, (draft) => [
      { kind: 'put_type', id: idOf(draft, 'probe'), label: 'Renamed probe' },
    ]);

    expect(harness.run(queued)).toMatchObject({ status: 'applied' });
    expect(storedValues(harness, itemId)).toEqual({ [serial]: 'SN-1' });
  });

  it('does not move a change authored against the active revision', () => {
    const harness = openHarness();
    const probe = publishProbe(harness);
    const replaced = replaceFields(harness, probe.revision);

    const outcome = harness.run(
      create(idOf(probe.draft, 'probe'), replaced.revision, [
        { fieldId: idOf(probe.draft, 'serial'), values: ['SN-1'] },
      ])
    );

    expect(outcome).toMatchObject({ status: 'rejected', reason: 'invalid' });
  });

  it('follows lineage recorded across later revisions to the live end', () => {
    const harness = openHarness();
    const probe = publishProbe(harness);
    const queued = create(idOf(probe.draft, 'probe'), probe.revision, [
      { fieldId: idOf(probe.draft, 'serial'), values: ['SN-1'] },
    ]);
    const replaced = replaceFields(harness, probe.revision);
    const added = publish(harness, replaced.revision, (draft) => [
      {
        kind: 'put_field',
        typeId: idOf(draft, 'probe'),
        key: 'serial_code',
        label: 'Serial code',
        fieldKind: 'short_text',
        ...STORED,
      },
    ]);
    const chained = publish(harness, added.revision, (draft) => [
      {
        kind: 'archive_field',
        id: idOf(draft, 'serial_number'),
        replacedBy: idOf(draft, 'serial_code'),
      },
    ]);

    expect(harness.run(queued)).toMatchObject({ status: 'applied' });
    expect(storedValues(harness, queued.entityId)).toEqual({
      [idOf(chained.draft, 'serial_code')]: 'SN-1',
    });
  });
});

describe('moving a rebased change onto a replacement type', () => {
  /** `gauge` replaces `probe`, and its `gauge_serial` replaces `serial`; `weight` has none. */
  function replaceType(harness: Harness, base: number): { revision: number; draft: Draft } {
    const typed = publish(harness, base, () => [
      { kind: 'put_type', key: 'gauge', label: 'Gauge' },
    ]);
    const fielded = publish(harness, typed.revision, (draft) => [
      {
        kind: 'put_field',
        typeId: idOf(draft, 'gauge'),
        key: 'gauge_serial',
        label: 'Serial',
        fieldKind: 'short_text',
        ...STORED,
      },
    ]);
    return publish(harness, fielded.revision, (draft) => [
      { kind: 'archive_type', id: idOf(draft, 'probe'), replacedBy: idOf(draft, 'gauge') },
      { kind: 'archive_field', id: idOf(draft, 'serial'), replacedBy: idOf(draft, 'gauge_serial') },
    ]);
  }

  it('creates the item as the replacement type with every value moved', () => {
    const harness = openHarness();
    const probe = publishProbe(harness);
    const queued = create(idOf(probe.draft, 'probe'), probe.revision, [
      { fieldId: idOf(probe.draft, 'serial'), values: ['SN-1'] },
    ]);
    const replaced = replaceType(harness, probe.revision);

    expect(harness.run(queued)).toMatchObject({ status: 'applied' });
    expect(harness.item(queued.entityId).typeId).toBe(idOf(replaced.draft, 'gauge'));
    expect(storedValues(harness, queued.entityId)).toEqual({
      [idOf(replaced.draft, 'gauge_serial')]: 'SN-1',
    });
  });

  it('refuses when a value has no place on the replacement type, naming the type', () => {
    const harness = openHarness();
    const probe = publishProbe(harness);
    const queued = create(idOf(probe.draft, 'probe'), probe.revision, [
      { fieldId: idOf(probe.draft, 'serial'), values: ['SN-1'] },
      { fieldId: idOf(probe.draft, 'weight'), values: [GRAMS] },
    ]);
    const replaced = replaceType(harness, probe.revision);

    expect(harness.run(queued)).toMatchObject({
      status: 'rejected',
      reason: 'catalogue_repair_required',
      catalogueChanges: [
        {
          definition: 'type',
          id: idOf(probe.draft, 'probe'),
          change: 'replaced',
          replacementId: idOf(replaced.draft, 'gauge'),
          revision: replaced.revision,
        },
      ],
    });
  });
});
