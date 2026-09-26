/**
 * POPS-4844: a catalogue field's `defaultValues` reach the phone unchanged,
 * and a catalogue from an Inventory that predates field defaults still parses.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createInventoryFake } from './inventory-fake.js';
import { closeOpenedApps, get, openWith } from './mobile-inventory-app.js';

const JsonObject = z.record(z.string(), z.unknown());

const Catalogue = JsonObject.and(
  z.object({
    revision: JsonObject.and(z.object({ revision: z.number() })),
    types: z.array(JsonObject.and(z.object({ fields: z.array(JsonObject) }))),
  })
);

type CatalogueJson = z.infer<typeof Catalogue>;

function fixtureCatalogue(): CatalogueJson {
  const [first] = z
    .object({ catalogues: z.array(Catalogue) })
    .parse(
      JSON.parse(
        readFileSync(
          join(dirname(fileURLToPath(import.meta.url)), '../../../contracts/value-vectors-v1.json'),
          'utf8'
        )
      )
    ).catalogues;
  if (first === undefined) throw new Error('the fixture has no catalogue');
  return first;
}

const catalogue = fixtureCatalogue();

const DEFAULTS = [{ optionId: '7a3f7c38-8a0e-4c52-9d0b-6f1c2d3e4a5b' }, 'fragile', 3];

function catalogueWithDefaults(): CatalogueJson {
  const [type, ...otherTypes] = catalogue.types;
  if (type === undefined) throw new Error('the fixture catalogue has no types');
  const [defaulted, legacy, ...rest] = type.fields;
  if (defaulted === undefined || legacy === undefined) {
    throw new Error('the fixture type needs two fields');
  }
  const { defaultValues: _dropped, ...legacyWithoutKey } = legacy;
  return {
    ...catalogue,
    types: [
      {
        ...type,
        fields: [{ ...defaulted, defaultValues: DEFAULTS }, legacyWithoutKey, ...rest],
      },
      ...otherTypes,
    ],
  };
}

afterEach(closeOpenedApps);

describe('field default values through bfm', () => {
  it('forwards a field default unchanged and still parses a field without the key', async () => {
    const upstream = catalogueWithDefaults();
    const fake = createInventoryFake({
      catalogueRevisionResult: () => ({ kind: 'ok', value: upstream }),
    });
    const { app, token } = openWith(fake.factory);

    const res = await get(
      app,
      token,
      `/mobile/inventory/type-catalogue?revision=${String(catalogue.revision.revision)}`
    );

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const { draftVersion: _draftVersion, ...revisionForPhone } = upstream.revision;
    expect(res.body).toEqual({ ...upstream, revision: revisionForPhone });
    const fields = z
      .object({ types: z.array(z.object({ fields: z.array(JsonObject) })) })
      .parse(res.body).types[0]?.fields;
    expect(fields?.[0]?.['defaultValues']).toEqual(DEFAULTS);
    expect(fields?.[1]).not.toHaveProperty('defaultValues');
  });
});
