/**
 * The phone's catalogue carries computed expressions as opaque JSON. That is
 * why a new expression node (`coalesce`) needs no protocol bump: a protocol-2
 * phone stores the tree unchanged, and one that cannot parse it keeps the
 * server's evaluation (Inventory ADR-002 D10/D11). Typing the expression here
 * would make every new node a hard decode failure on installed phones.
 */
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { MobileInventoryCatalogueRevisionDescriptorSchema } from '../mobile-inventory-protocol2-catalogue-schemas.js';

const actor = { kind: 'web', id: 'owner', label: 'Owner' };

function descriptor(expression: unknown) {
  const typeId = randomUUID();
  return {
    revision: {
      revision: 3,
      baseRevision: 2,
      status: 'published',
      minimumProtocol: 2,
      created: { actor, at: '2026-09-24T00:00:00.000Z' },
      published: { actor, at: '2026-09-24T00:00:00.000Z', note: null },
      abandoned: null,
    },
    types: [
      {
        revision: 3,
        id: typeId,
        key: 'kit',
        label: 'Kit',
        description: null,
        sortOrder: 0,
        capabilities: [],
        legacyLabels: [],
        presentation: {},
        archivedAt: null,
        fields: [
          {
            id: randomUUID(),
            typeId,
            key: 'best',
            label: 'Best',
            help: null,
            sortOrder: 0,
            kind: 'integer',
            cardinality: 'one',
            required: false,
            storage: 'computed',
            fixedUnit: null,
            referenceKinds: [],
            referenceTypeIds: [],
            expressionVersion: 1,
            expression,
            allowOverride: false,
            presentation: {},
            archivedAt: null,
            enumOptions: [],
          },
        ],
      },
    ],
  };
}

describe('the phone catalogue descriptor', () => {
  it('relays a coalesce expression to protocol-2 phones unchanged', () => {
    const expression = {
      op: 'coalesce',
      values: [
        { op: 'read', path: [], fieldId: randomUUID() },
        { op: 'literal', value: 0 },
      ],
    };
    const parsed = MobileInventoryCatalogueRevisionDescriptorSchema.parse(descriptor(expression));
    expect(parsed.types[0]?.fields[0]?.expression).toEqual(expression);
  });

  it('relays syntax no build knows yet rather than refusing the catalogue', () => {
    const expression = { op: 'someday', operands: [] };
    expect(
      MobileInventoryCatalogueRevisionDescriptorSchema.safeParse(descriptor(expression)).success
    ).toBe(true);
  });
});

describe('replacement lineage on the phone catalogue', () => {
  function replaced(typeReplacedBy: unknown, fieldReplacedBy: unknown) {
    const body = descriptor(null);
    const [type] = body.types;
    const [field] = type?.fields ?? [];
    if (type === undefined || field === undefined) throw new Error('fixture has no field');
    return {
      ...body,
      types: [
        {
          ...type,
          archivedAt: '2026-09-24T00:00:00.000Z',
          replacedBy: typeReplacedBy,
          fields: [
            { ...field, storage: 'stored', expressionVersion: null, replacedBy: fieldReplacedBy },
          ],
        },
      ],
    };
  }

  it('relays the type and field that replaced archived ones', () => {
    const typeReplacement = randomUUID();
    const fieldReplacement = randomUUID();

    const parsed = MobileInventoryCatalogueRevisionDescriptorSchema.parse(
      replaced(typeReplacement, fieldReplacement)
    );

    expect(parsed.types[0]?.replacedBy).toBe(typeReplacement);
    expect(parsed.types[0]?.fields[0]?.replacedBy).toBe(fieldReplacement);
  });

  it('parses a catalogue from an Inventory that records no lineage', () => {
    const parsed = MobileInventoryCatalogueRevisionDescriptorSchema.parse(descriptor(null));

    expect(parsed.types[0]?.replacedBy).toBeUndefined();
  });

  it('refuses lineage that does not name a definition', () => {
    expect(
      MobileInventoryCatalogueRevisionDescriptorSchema.safeParse(replaced('not-an-id', null))
        .success
    ).toBe(false);
  });
});

describe('type parents on the phone catalogue', () => {
  it('parses a type parent', () => {
    const parentTypeId = randomUUID();
    const body = descriptor(null);
    const [type] = body.types;
    if (type === undefined) throw new Error('fixture has no type');

    const parsed = MobileInventoryCatalogueRevisionDescriptorSchema.parse({
      ...body,
      types: [{ ...type, parentTypeId }],
    });

    expect(parsed.types[0]?.parentTypeId).toBe(parentTypeId);
  });

  it('refuses a non-uuid parent', () => {
    const body = descriptor(null);
    const [type] = body.types;
    if (type === undefined) throw new Error('fixture has no type');

    expect(
      MobileInventoryCatalogueRevisionDescriptorSchema.safeParse({
        ...body,
        types: [{ ...type, parentTypeId: 'not-a-uuid' }],
      }).success
    ).toBe(false);
  });
});
