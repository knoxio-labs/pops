/**
 * POPS-4403: inventory's protocol-2 value vectors (`contracts/value-vectors-v1.json`,
 * vendored from the pillar) through the real app, gateway and wire validation.
 * bfm must hand every value, reference target and catalogue revision to the
 * phone unchanged, refuse a catalogue carrying a kind outside the closed
 * vocabulary, and leave a page's minimum protocol for the phone to judge.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createInventoryFake } from './inventory-fake.js';
import { closeOpenedApps, get, openWith } from './mobile-inventory-app.js';

const JsonObject = z.record(z.string(), z.unknown());

const RowSchema = JsonObject.and(z.object({ id: z.string() }));

const FixtureSchema = z.object({
  liveRevision: z.number(),
  currentRevision: z.number(),
  catalogues: z.array(JsonObject.and(z.object({ types: z.array(JsonObject) }))),
  vectors: z.array(
    z.object({
      item: RowSchema,
      referenceTargets: z
        .array(
          z.union([
            z.object({ kind: z.literal('item'), item: RowSchema }),
            z.object({ kind: z.literal('location'), location: RowSchema }),
            z.null(),
          ])
        )
        .optional(),
    })
  ),
  negativeVectors: z.array(
    z.discriminatedUnion('category', [
      z.object({ category: z.literal('malformed_value'), fieldValue: JsonObject }),
      z.object({ category: z.literal('unknown_kind'), field: JsonObject }),
      z.object({ category: z.literal('protocol_above_supported'), minimumProtocol: z.number() }),
    ])
  ),
});

const fixture = FixtureSchema.parse(
  JSON.parse(
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../../contracts/value-vectors-v1.json'),
      'utf8'
    )
  )
);

type Row = z.infer<typeof RowSchema>;

function unique(rows: readonly Row[]): Row[] {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

const items = unique(
  fixture.vectors.flatMap((vector) => [
    vector.item,
    ...(vector.referenceTargets ?? []).flatMap((target) =>
      target?.kind === 'item' ? [target.item] : []
    ),
  ])
);

const locations = unique(
  fixture.vectors.flatMap((vector) =>
    (vector.referenceTargets ?? []).flatMap((target) =>
      target?.kind === 'location' ? [target.location] : []
    )
  )
);

function snapshotPage(minimumProtocol = 2): Record<string, unknown> {
  return {
    epoch: 'epoch-1',
    highWaterSeq: 100,
    minimumProtocol,
    catalogueVersion: 'cat-1',
    catalogueRevision: fixture.currentRevision,
    total: items.length,
    items,
    locations,
    nextCursor: null,
  };
}

function negative<Category extends (typeof fixture.negativeVectors)[number]['category']>(
  category: Category
) {
  const found = fixture.negativeVectors.find(
    (vector): vector is Extract<(typeof fixture.negativeVectors)[number], { category: Category }> =>
      vector.category === category
  );
  if (found === undefined) throw new Error(`the fixture has no ${category} case`);
  return found;
}

afterEach(closeOpenedApps);

describe('protocol-2 value vectors through bfm', () => {
  it('forwards every vector item, reference target and location unchanged', async () => {
    const fake = createInventoryFake({ snapshotResult: { kind: 'ok', value: snapshotPage() } });
    const { app, token } = openWith(fake.factory);

    const res = await get(app, token, '/mobile/inventory/sync/snapshot');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(snapshotPage());
  });

  it('forwards both catalogue revisions the values name, less the authoring-only draft version', async () => {
    const fake = createInventoryFake({
      catalogueRevisionResult: (revision) => {
        const catalogue = fixture.catalogues.find(
          (entry) => JsonObject.parse(entry['revision'])['revision'] === revision
        );
        return catalogue === undefined
          ? { kind: 'not-found', pillar: 'inventory', message: 'unknown revision' }
          : { kind: 'ok', value: catalogue };
      },
    });
    const { app, token } = openWith(fake.factory);

    for (const [index, revision] of [fixture.liveRevision, fixture.currentRevision].entries()) {
      const res = await get(app, token, `/mobile/inventory/type-catalogue?revision=${revision}`);
      expect(res.status, `revision ${String(revision)}`).toBe(200);
      const catalogue = fixture.catalogues[index];
      if (catalogue === undefined) throw new Error('the fixture has no catalogue');
      const { draftVersion, ...revisionForPhone } = JsonObject.parse(catalogue['revision']);
      expect(draftVersion).toEqual(expect.any(Number));
      expect(res.body).toEqual({ ...catalogue, revision: revisionForPhone });
    }
  });

  it('refuses a catalogue carrying a field kind outside the closed vocabulary', async () => {
    const { field } = negative('unknown_kind');
    const [catalogue] = fixture.catalogues;
    if (catalogue === undefined) throw new Error('the fixture has no catalogue');
    const withUnknown = {
      ...catalogue,
      types: catalogue.types.map((type) => ({
        ...type,
        fields: [...z.array(JsonObject).parse(type['fields']), field],
      })),
    };
    const fake = createInventoryFake({
      catalogueRevisionResult: () => ({ kind: 'ok', value: withUnknown }),
    });
    const { app, token } = openWith(fake.factory);

    const res = await get(
      app,
      token,
      `/mobile/inventory/type-catalogue?revision=${fixture.liveRevision}`
    );

    expect(res.status).toBe(502);
  });

  it('forwards a malformed value opaquely: the phone checks it against its field kind', async () => {
    const malformed = fixture.negativeVectors.flatMap((vector) =>
      vector.category === 'malformed_value' ? [vector.fieldValue] : []
    );
    const [first] = items;
    if (first === undefined) throw new Error('the fixture has no items');
    const page = { ...snapshotPage(), items: [{ ...first, fieldValues: malformed }], total: 1 };
    const fake = createInventoryFake({ snapshotResult: { kind: 'ok', value: page } });
    const { app, token } = openWith(fake.factory);

    const res = await get(app, token, '/mobile/inventory/sync/snapshot');

    expect(res.status).toBe(200);
    expect(res.body.items[0].fieldValues).toEqual(malformed);
  });

  it('forwards a minimum protocol above the supported one for the phone to refuse', async () => {
    const { minimumProtocol } = negative('protocol_above_supported');
    const fake = createInventoryFake({
      snapshotResult: { kind: 'ok', value: snapshotPage(minimumProtocol) },
    });
    const { app, token } = openWith(fake.factory);

    const res = await get(app, token, '/mobile/inventory/sync/snapshot');

    expect(res.status).toBe(200);
    expect(res.body.minimumProtocol).toBe(minimumProtocol);
  });
});
