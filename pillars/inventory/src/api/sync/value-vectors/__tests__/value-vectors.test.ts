import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PRIMITIVE_KINDS } from '../../../../catalogue/value-types.js';
import { TypeCatalogueDescriptorSchema } from '../../../../contract/rest-catalogue-schemas.js';
import { SyncItemSchema, SyncLocationSchema } from '../../../../contract/rest-sync-schemas.js';
import { openMigratedMemoryDb } from '../../../../db/open-migrated-memory-db.js';
import { activateMinimumProtocol, readMinimumProtocol } from '../../../../protocol/rollout.js';
import { SyncRequestError } from '../../errors.js';
import { requireProtocol } from '../../protocol.js';
import { buildValueVectors } from '../build.js';
import { KIND_FIELDS } from '../catalogue-fields.js';

import type { NegativeValueVector, ValueVector, ValueVectorFile } from '../build.js';

const CONTRACTS_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '..',
  'contracts',
  'value-vectors-v1.json'
);

function build(): ValueVectorFile {
  return buildValueVectors(openMigratedMemoryDb().db);
}

const file = build();

function negative<Category extends NegativeValueVector['category']>(
  category: Category
): Extract<NegativeValueVector, { category: Category }>[] {
  return file.negativeVectors.filter(
    (vector): vector is Extract<NegativeValueVector, { category: Category }> =>
      vector.category === category
  );
}

function targetStates(vector: ValueVector): string[] {
  return (vector.referenceTargets ?? []).map((target) => {
    if (target === null) return 'missing';
    const row = target.kind === 'item' ? target.item : target.location;
    return `${target.kind}:${row.deletedAt === null ? 'live' : 'deleted'}`;
  });
}

describe('value vectors', () => {
  it('matches the committed contracts/value-vectors-v1.json exactly', () => {
    const committed: unknown = JSON.parse(readFileSync(CONTRACTS_PATH, 'utf8'));
    expect(JSON.parse(JSON.stringify(file))).toEqual(committed);
  });

  it('regenerates byte-identically from a fresh database', () => {
    expect(JSON.stringify(build())).toBe(JSON.stringify(file));
  });

  it('covers every primitive kind at every cardinality the catalogue allows', () => {
    for (const kind of PRIMITIVE_KINDS) {
      const cardinalities = new Set(
        file.vectors
          .filter((vector) => vector.kind === kind && vector.fieldValue !== null)
          .map((vector) => vector.cardinality)
      );
      const allowed = KIND_FIELDS[kind].many === null ? ['one'] : ['one', 'many'];
      expect([...cardinalities].toSorted(), kind).toEqual(allowed.toSorted());
    }
  });

  it('keeps a many value in the order it was written, unsorted', () => {
    const vector = file.vectors.find(
      (entry) => entry.kind === 'integer' && entry.cardinality === 'many'
    );
    expect(vector?.fieldValue?.values).toEqual([3, -1, 2, Number.MAX_SAFE_INTEGER]);
  });

  it('carries exact decimals at the precision limit in both signs', () => {
    const values = file.vectors
      .filter((vector) => vector.kind === 'decimal')
      .flatMap((vector) => vector.fieldValue?.values ?? []);
    expect(values).toEqual(
      expect.arrayContaining(['123456789.123456789', '-987654321.987654321', '2.50'])
    );
  });

  it('carries a measurement in a derived unit', () => {
    const units = file.vectors.flatMap((vector) =>
      vector.kind === 'measurement' ? (vector.fieldValue?.values ?? []) : []
    );
    expect(units).toContainEqual({ amount: '1000.5', unit: 'kg/m³' });
  });

  it('carries an absent field for a value never set and for one cleared by an edit', () => {
    const absent = file.vectors.filter(
      (vector) => vector.storage === 'stored' && vector.fieldValue === null
    );
    expect(absent.map((vector) => vector.command.op).toSorted()).toEqual([
      'item.create',
      'item.edit',
    ]);
    for (const vector of absent) {
      expect(vector.item.fieldValues.some((entry) => entry.fieldId === vector.fieldId)).toBe(false);
    }
  });

  it('covers every computed state, and unavailable with and without missing inputs', () => {
    const computed = file.vectors.flatMap((vector) =>
      vector.computedValue === null ? [] : [vector.computedValue]
    );
    expect(new Set(computed.map((value) => value.state))).toEqual(
      new Set(['ok', 'overridden', 'unavailable'])
    );
    const missingInputs = computed.flatMap((value) =>
      value.state === 'unavailable' ? [value.missingInputs.length] : []
    );
    expect(missingInputs.toSorted()).toEqual([0, 1]);
  });

  it('covers every reference target state, item and location', () => {
    const states = new Set(file.vectors.flatMap(targetStates));
    expect(states).toEqual(
      new Set(['item:live', 'item:deleted', 'location:live', 'location:deleted', 'missing'])
    );
  });

  it('shows an enum value naming an option the current revision archived', () => {
    const current = file.catalogues.find(
      (catalogue) => catalogue.revision.revision === file.currentRevision
    );
    const archived = current?.types
      .flatMap((type) => type.fields)
      .flatMap((field) => field.enumOptions)
      .filter((option) => option.archivedAt !== null)
      .map((option) => option.id);
    const selected = file.vectors
      .filter((vector) => vector.kind === 'enum')
      .flatMap((vector) => vector.fieldValue?.values ?? []);
    expect(archived).toHaveLength(1);
    expect(selected).toContainEqual({ optionId: archived?.[0] });
  });

  it('parses through the published sync and catalogue contract schemas unchanged', () => {
    for (const vector of file.vectors) {
      expect(SyncItemSchema.parse(vector.item), vector.name).toEqual(vector.item);
      for (const target of vector.referenceTargets ?? []) {
        if (target?.kind === 'item') expect(SyncItemSchema.parse(target.item)).toEqual(target.item);
        if (target?.kind === 'location') {
          expect(SyncLocationSchema.parse(target.location)).toEqual(target.location);
        }
      }
    }
    for (const catalogue of file.catalogues) {
      expect(TypeCatalogueDescriptorSchema.parse(catalogue)).toEqual(catalogue);
    }
  });

  it('records the engine refusing every malformed value', () => {
    const malformed = negative('malformed_value');
    expect(new Set(malformed.map((vector) => vector.kind))).toEqual(new Set(PRIMITIVE_KINDS));
    for (const vector of malformed) expect(vector.producerRejection, vector.name).toBe('invalid');
  });

  it('refuses the unknown-kind field at the catalogue contract', () => {
    const [vector] = negative('unknown_kind');
    const catalogue = file.catalogues[0];
    if (vector === undefined || catalogue === undefined) throw new Error('fixture incomplete');
    const withUnknown = {
      ...catalogue,
      types: catalogue.types.map((type) => ({ ...type, fields: [...type.fields, vector.field] })),
    };
    expect(TypeCatalogueDescriptorSchema.safeParse(withUnknown).success).toBe(false);
  });

  it('answers a protocol above the supported one with the real refusals', () => {
    const [vector] = negative('protocol_above_supported');
    if (vector === undefined) throw new Error('fixture incomplete');
    const { db } = openMigratedMemoryDb();
    expect(() =>
      activateMinimumProtocol(db, readMinimumProtocol(db), vector.minimumProtocol)
    ).toThrow(expect.objectContaining({ code: 'protocol_not_supported' }));
    expect(() => requireProtocol(String(vector.supportedProtocol), vector.minimumProtocol)).toThrow(
      new SyncRequestError(
        426,
        'client_too_old',
        `protocol ${String(vector.supportedProtocol)} is below this server's minimum of ${String(vector.minimumProtocol)}`
      )
    );
  });

  it('names every vector uniquely', () => {
    const names = [...file.vectors, ...file.negativeVectors].map((vector) => vector.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
