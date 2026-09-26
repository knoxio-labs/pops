import { randomUUID } from 'node:crypto';

import { eq, max } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createCatalogueDraft,
  patchCatalogueDraft,
  publishCatalogueDraft,
} from '../../catalogue/authoring.js';
import { loadPublishedCatalogue } from '../../catalogue/index.js';
import {
  WebBatchResponseSchema,
  type WebBatchBody,
  type WebBatchResponse,
} from '../../contract/rest-web-batch.js';
import { events, items, mutations } from '../../db/index.js';
import { createLocation, openSyncHarness, send, type SyncHarness } from './sync-harness.js';
import { createTestTransport } from './test-http.js';

const transport = createTestTransport();
let h: SyncHarness;

type BatchRow = WebBatchBody['rows'][number];
type BatchOutcome = WebBatchResponse['outcomes'][number];

const BATCH_AUTHOR = { kind: 'web', id: 'web-batch-test', label: 'Web batch test' } as const;

function row(overrides: Partial<BatchRow> = {}): BatchRow {
  return { name: '', type: '', quantity: '', code: '', where: '', note: '', ...overrides };
}

function body(
  rows: readonly BatchRow[],
  options: Pick<Partial<WebBatchBody>, 'destination' | 'dryRun'> = {}
): WebBatchBody {
  return {
    rows: [...rows],
    destination: options.destination ?? { kind: 'hand' },
    dryRun: options.dryRun ?? false,
  };
}

async function postBatch(request: WebBatchBody) {
  return h.api.post('/web/items/batch').send(request);
}

function parsedOutcomes(responseBody: unknown): BatchOutcome[] {
  return WebBatchResponseSchema.parse(responseBody).outcomes;
}

function counts() {
  return {
    items: h.db.db.select().from(items).all().length,
    events: h.db.db.select().from(events).all().length,
    mutations: h.db.db.select().from(mutations).all().length,
    maxSeq:
      h.db.db
        .select({ seq: max(events.seq) })
        .from(events)
        .get()?.seq ?? 0,
  };
}

beforeEach(() => {
  h = openSyncHarness(transport);
});

afterEach(() => h.close());

describe('POST /web/items/batch', () => {
  it('creates valid rows, reports invalid rows, and returns the created item id', async () => {
    const response = await postBatch(
      body([row({ name: 'Lamp', note: '  keep this note  ' }), row({ name: ' ', note: 'typed' })])
    );

    expect(response.status).toBe(200);
    const outcomes = parsedOutcomes(response.body);
    expect(outcomes).toEqual([
      { status: 'created', row: 0, itemId: expect.any(String) },
      {
        status: 'invalid',
        row: 1,
        issues: [{ column: 'name', code: 'name_required', message: 'Name is required.' }],
      },
    ]);

    const created = outcomes[0];
    if (created?.status !== 'created') throw new Error('expected a created outcome');
    const stored = h.db.db.select().from(items).where(eq(items.id, created.itemId)).get();
    expect(stored).toMatchObject({ id: created.itemId, name: 'Lamp', note: '  keep this note  ' });
    const read = await h.api.get(`/web/items/${created.itemId}`);
    expect(read.status).toBe(200);
    expect(read.body.item).toMatchObject({ id: created.itemId, name: 'Lamp' });
    expect(
      h.db.db
        .select({ actorKind: events.actorKind })
        .from(events)
        .where(eq(events.entityId, created.itemId))
        .get()
    ).toEqual({ actorKind: 'web' });
  });

  it('defaults omitted cells, destination, and dryRun', async () => {
    const response = await h.api.post('/web/items/batch').send({ rows: [{ name: 'Defaults' }] });

    expect(response.status).toBe(200);
    const outcomes = parsedOutcomes(response.body);
    const created = outcomes[0];
    if (created?.status !== 'created') throw new Error('expected a created outcome');
    expect(h.db.db.select().from(items).where(eq(items.id, created.itemId)).get()).toMatchObject({
      id: created.itemId,
      placementKind: 'hand',
      quantity: 1,
      note: null,
    });
  });

  it('dry-runs valid rows and leaves items, events, mutations, and seq unchanged', async () => {
    const before = counts();

    const response = await postBatch(
      body([row({ name: 'Preview item' }), row({ name: ' ', note: 'not blank' }), row()], {
        dryRun: true,
      })
    );

    expect(response.status).toBe(200);
    expect(parsedOutcomes(response.body)).toEqual([
      { status: 'valid', row: 0 },
      {
        status: 'invalid',
        row: 1,
        issues: [{ column: 'name', code: 'name_required', message: 'Name is required.' }],
      },
      { status: 'blank', row: 2 },
    ]);
    expect(counts()).toEqual(before);
  });

  it('partially accepts rows and rejects duplicate and already-held codes', async () => {
    const holder = await postBatch(body([row({ name: 'Existing', code: 'B12' })]));
    expect(holder.status).toBe(200);

    const response = await postBatch(
      body([
        row({ name: 'Taken', code: ' b12 ' }),
        row({ name: 'Duplicate one', code: 'C3' }),
        row({ name: 'Duplicate two', code: 'c3' }),
        row({ name: 'Valid row' }),
      ])
    );

    expect(response.status).toBe(200);
    expect(parsedOutcomes(response.body)).toEqual([
      {
        status: 'invalid',
        row: 0,
        issues: [
          { column: 'code', code: 'code_taken', message: 'Code B12 is already on Existing.' },
        ],
      },
      {
        status: 'invalid',
        row: 1,
        issues: [{ column: 'code', code: 'code_duplicate', message: 'Code C3 is also on row 3.' }],
      },
      {
        status: 'invalid',
        row: 2,
        issues: [{ column: 'code', code: 'code_duplicate', message: 'Code C3 is also on row 2.' }],
      },
      { status: 'created', row: 3, itemId: expect.any(String) },
    ]);
    expect(
      h.db.db
        .select()
        .from(items)
        .all()
        .map((item) => item.name)
    ).toEqual(['Existing', 'Valid row']);
  });

  it('validates type, quantity, and unresolved where cells without stopping the batch', async () => {
    const response = await postBatch(
      body([
        row({ name: 'Unknown', type: 'Not a real type' }),
        row({ name: 'Zero', quantity: '0' }),
        row({ name: 'Negative', quantity: '-1' }),
        row({ name: 'Decimal', quantity: '2.5' }),
        row({ name: 'Missing place', where: 'Nowhere' }),
        row({ name: 'Still valid' }),
      ])
    );

    expect(response.status).toBe(200);
    const outcomes = parsedOutcomes(response.body);
    expect(outcomes[0]).toMatchObject({
      status: 'invalid',
      row: 0,
      issues: [
        {
          column: 'type',
          code: 'type_unknown',
          message: 'No type is called Not a real type. Leave it blank to file the item untyped.',
        },
      ],
    });
    expect(outcomes[1]).toMatchObject({
      status: 'invalid',
      row: 1,
      issues: [{ column: 'quantity', code: 'quantity_invalid' }],
    });
    expect(outcomes[2]).toMatchObject({
      status: 'invalid',
      row: 2,
      issues: [{ column: 'quantity', code: 'quantity_invalid' }],
    });
    expect(outcomes[3]).toMatchObject({
      status: 'invalid',
      row: 3,
      issues: [{ column: 'quantity', code: 'quantity_invalid' }],
    });
    expect(outcomes[4]).toMatchObject({
      status: 'invalid',
      row: 4,
      issues: [
        {
          column: 'where',
          code: 'where_unresolved',
          message: 'No place or container is called Nowhere.',
        },
      ],
    });
    expect(outcomes[5]).toMatchObject({ status: 'created', row: 5 });
  });

  it('resolves locations and uses destination for blank where cells', async () => {
    const garage = randomUUID();
    const locationResponse = await send(h.api, [createLocation(garage, 'Garage')]);
    expect(locationResponse.status).toBe(200);

    const response = await postBatch(
      body([row({ name: 'At garage', where: ' garage ' }), row({ name: 'At destination' })], {
        destination: { kind: 'location', locationId: garage },
      })
    );

    expect(response.status).toBe(200);
    const outcomes = parsedOutcomes(response.body);
    const itemIds = outcomes.flatMap((outcome) =>
      outcome.status === 'created' ? [outcome.itemId] : []
    );
    expect(itemIds).toHaveLength(2);
    expect(
      h.db.db
        .select({ id: items.id, locationId: items.locationId, placementKind: items.placementKind })
        .from(items)
        .where(eq(items.locationId, garage))
        .all()
    ).toHaveLength(2);
    expect(h.db.db.select().from(items).where(eq(items.id, itemIds[0]!)).get()).toMatchObject({
      placementKind: 'location',
      locationId: garage,
    });
    expect(h.db.db.select().from(items).where(eq(items.id, itemIds[1]!)).get()).toMatchObject({
      placementKind: 'location',
      locationId: garage,
    });
  });

  it('rejects a Where cell that resolves to more than one live location', async () => {
    const firstGarage = randomUUID();
    const secondGarage = randomUUID();
    const locationsResponse = await send(h.api, [
      createLocation(firstGarage, 'Garage'),
      createLocation(secondGarage, 'Garage'),
    ]);
    expect(locationsResponse.status).toBe(200);

    const response = await postBatch(body([row({ name: 'Ambiguous', where: ' garage ' })]));

    expect(response.status).toBe(200);
    expect(parsedOutcomes(response.body)).toEqual([
      {
        status: 'invalid',
        row: 0,
        issues: [
          {
            column: 'where',
            code: 'where_unresolved',
            message: 'No place or container is called garage.',
          },
        ],
      },
    ]);
    expect(h.db.db.select().from(items).all()).toHaveLength(0);
  });

  it('resolves an active container by name and places the created item inside it', async () => {
    const catalogue = loadPublishedCatalogue(h.db.db);
    const containerType = catalogue?.types.find(
      (type) => type.archivedAt === null && type.capabilities.includes('containment')
    );
    if (containerType === undefined)
      throw new Error('the bootstrap catalogue needs a container type');

    const containerResponse = await postBatch(
      body([row({ name: 'Moving box', type: containerType.label })])
    );
    expect(containerResponse.status).toBe(200);
    const containerOutcome = parsedOutcomes(containerResponse.body)[0];
    if (containerOutcome?.status !== 'created') throw new Error('expected a container item');

    const response = await postBatch(body([row({ name: 'Inside box', where: ' moving box ' })]));

    expect(response.status).toBe(200);
    const outcome = parsedOutcomes(response.body)[0];
    if (outcome?.status !== 'created') throw new Error('expected an item inside the container');
    expect(h.db.db.select().from(items).where(eq(items.id, outcome.itemId)).get()).toMatchObject({
      id: outcome.itemId,
      placementKind: 'container',
      containingItemId: containerOutcome.itemId,
    });
  });

  it('accepts exactly 200 rows and rejects 201 rows', async () => {
    const maximum = Array.from({ length: 200 }, (_, index) => row({ name: `Item ${index}` }));
    const accepted = await postBatch(body(maximum));
    expect(accepted.status).toBe(200);
    expect(parsedOutcomes(accepted.body)).toHaveLength(200);
    expect(parsedOutcomes(accepted.body).every((outcome) => outcome.status === 'created')).toBe(
      true
    );

    const before = counts();
    const rejected = await postBatch(body([...maximum, row({ name: 'Too many' })]));
    expect(rejected.status).toBe(400);
    expect(counts()).toEqual(before);
  });

  it('rejects generic field values instead of creating a row with unsupported data', async () => {
    const before = counts();
    const response = await h.api.post('/web/items/batch').send({
      rows: [{ name: 'Generic field', fields: { brand: 'not a batch column' } }],
    });

    expect(response.status).toBe(400);
    expect(counts()).toEqual(before);
  });

  it('uses the published type id and rejects container quantities above one', async () => {
    const catalogue = loadPublishedCatalogue(h.db.db);
    const ordinaryType = catalogue?.types.find(
      (type) => type.archivedAt === null && type.fields.every((field) => !field.required)
    );
    const containerType = catalogue?.types.find(
      (type) => type.archivedAt === null && type.capabilities.includes('containment')
    );
    if (ordinaryType === undefined || containerType === undefined) {
      throw new Error('the bootstrap catalogue must contain an ordinary and a container type');
    }

    const response = await postBatch(
      body([
        row({ name: 'Typed item', type: ordinaryType.label }),
        row({ name: 'Too many containers', type: containerType.label, quantity: '2' }),
      ])
    );

    expect(response.status).toBe(200);
    const outcomes = parsedOutcomes(response.body);
    expect(outcomes[0]).toMatchObject({ status: 'created', row: 0 });
    expect(outcomes[1]).toEqual({
      status: 'invalid',
      row: 1,
      issues: [
        {
          column: 'quantity',
          code: 'quantity_container',
          message: `A ${containerType.label} is a container, so its quantity is 1.`,
        },
      ],
    });

    const created = outcomes[0];
    if (created?.status !== 'created') throw new Error('expected a typed item');
    expect(h.db.db.select().from(items).where(eq(items.id, created.itemId)).get()).toMatchObject({
      typeId: ordinaryType.id,
    });
  });

  it('maps a published type with a missing required field to a type issue', async () => {
    const catalogue = loadPublishedCatalogue(h.db.db);
    if (catalogue === null) throw new Error('the bootstrap catalogue must be published');

    const draft = createCatalogueDraft(h.db.db, catalogue.revision.revision, BATCH_AUTHOR);
    const withType = patchCatalogueDraft(
      h.db.db,
      {
        revision: draft.revision.revision,
        baseRevision: catalogue.revision.revision,
        expectedDraftVersion: draft.revision.draftVersion,
      },
      [{ kind: 'put_type', key: 'required_batch_type', label: 'Required batch type' }]
    ).draft;
    const type = withType.types.find((entry) => entry.key === 'required_batch_type');
    if (type === undefined) throw new Error('required batch type was not created');
    const withField = patchCatalogueDraft(
      h.db.db,
      {
        revision: withType.revision.revision,
        baseRevision: catalogue.revision.revision,
        expectedDraftVersion: withType.revision.draftVersion,
      },
      [
        {
          kind: 'put_field',
          typeId: type.id,
          key: 'required_value',
          label: 'Required value',
          fieldKind: 'short_text',
          cardinality: 'one',
          required: true,
          storage: 'stored',
        },
      ]
    ).draft;
    publishCatalogueDraft(
      h.db.db,
      withField.revision.revision,
      {
        baseRevision: catalogue.revision.revision,
        expectedDraftVersion: withField.revision.draftVersion,
        note: null,
      },
      BATCH_AUTHOR
    );

    const response = await postBatch(
      body([row({ name: 'Missing required value', type: type.label })])
    );

    expect(response.status).toBe(200);
    expect(parsedOutcomes(response.body)).toEqual([
      {
        status: 'invalid',
        row: 0,
        issues: [
          {
            column: 'type',
            code: 'invalid',
            message: expect.stringContaining('requires a value'),
          },
        ],
      },
    ]);
    expect(h.db.db.select().from(items).all()).toHaveLength(0);
  });
});
