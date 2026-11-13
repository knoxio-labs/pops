import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildPillarOpenApiDocument } from '@pops/contract-openapi';

import { MobileTripInputSchema, MobileTripPatchInputSchema } from '../mobile-trip-write-schemas.js';
import { bfmContract } from '../rest.js';

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function object(value: unknown): Record<string, unknown> {
  if (!isObject(value)) {
    throw new TypeError('Expected an OpenAPI object');
  }
  return value;
}

function resolve(node: unknown, document: unknown, seen = new Set<string>()): unknown {
  if (Array.isArray(node)) return node.map((child) => resolve(child, document, seen));
  if (node === null || typeof node !== 'object') return node;
  const record = object(node);
  if (typeof record['$ref'] === 'string') {
    const ref = record['$ref'];
    if (!ref.startsWith('#/') || seen.has(ref)) throw new Error('Unresolvable schema reference');
    const target = ref
      .slice(2)
      .split('/')
      .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
      .reduce<unknown>((current, key) => object(current)[key], document);
    if (target === undefined) throw new Error('Missing schema reference');
    const { $ref: _ref, ...siblings } = record;
    return resolve({ ...object(target), ...siblings }, document, new Set([...seen, ref]));
  }
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, resolve(value, document, seen)])
  );
}

function normalized(document: unknown): unknown {
  const { components, ...rest } = object(document);
  const { schemas: _schemas, ...otherComponents } = object(components);
  return { ...object(resolve(rest, document)), components: otherComponents };
}

function documents() {
  const legacy = {
    ...bfmContract,
    mobileTrips: {
      ...bfmContract.mobileTrips,
      updateTrip: { ...bfmContract.mobileTrips.updateTrip, body: MobileTripInputSchema },
    },
  };
  const options = {
    packageDir: fileURLToPath(new URL('../../../', import.meta.url)),
    pillarId: 'bfm',
    description: 'Canonical projection equivalence',
  };
  return {
    previous: buildPillarOpenApiDocument({
      ...options,
      contract: legacy,
      hoistRecursiveDefinitions: false,
    }),
    named: buildPillarOpenApiDocument({
      ...options,
      contract: bfmContract,
      hoistRecursiveDefinitions: true,
    }),
  };
}

describe('named Trip PATCH projection', () => {
  it('preserves every resolved route and runtime schema while naming only the PATCH body', () => {
    const { previous, named } = documents();
    expect(normalized(named)).toEqual(normalized(previous));
    const schemas = object(object(object(named)['components'])['schemas']);
    expect(Object.keys(schemas).toSorted()).toEqual(['ErrorBody', 'MobileTripPatchInput']);
    const path = object(object(object(named)['paths'])['/mobile/trips/{id}']);
    const content = object(object(object(path['patch'])['requestBody'])['content']);
    expect(object(content['application/json'])['schema']).toEqual({
      $ref: '#/components/schemas/MobileTripPatchInput',
    });
  });

  it('detects a lost null constraint rather than treating every reference rewrite as equivalent', () => {
    const { previous, named } = documents();
    const changed = structuredClone(named);
    const schemas = object(object(object(changed)['components'])['schemas']);
    const fields = object(object(schemas['MobileTripPatchInput'])['properties']);
    object(fields['name'])['nullable'] = false;
    expect(normalized(changed)).not.toEqual(normalized(previous));
  });

  it('retains the source validator for omitted, null and explicit values and refuses extra fields', () => {
    for (const input of [
      {},
      { name: null, tagId: null, parentId: null },
      { when: '  Christmas, maybe longer  ', notes: '' },
    ]) {
      expect(MobileTripPatchInputSchema.parse(input)).toEqual(MobileTripInputSchema.parse(input));
    }
    for (const input of [{ unexpected: true }, { name: '' }, { parentId: -1 }, { when: null }]) {
      expect(MobileTripPatchInputSchema.safeParse(input).success).toBe(false);
      expect(MobileTripInputSchema.safeParse(input).success).toBe(false);
    }
  });
});
