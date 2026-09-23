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
