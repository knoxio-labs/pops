import { describe, expect, it } from 'vitest';

import { typeReplacedCase } from '../../../foundation/test-fixtures/sync.js';
import { changeTypeWrite } from './repair-targets.js';

import type {
  CatalogueEnumOption,
  CatalogueField,
  CatalogueType,
} from '../../../catalogue-editor/types.js';
import type { RepairCase } from '../sync-model.js';

function option(id: string, key: string, archivedAt: string | null = null): CatalogueEnumOption {
  return { archivedAt, id, key, label: key, sortOrder: 0 };
}

function field(
  id: string,
  key: string,
  overrides: Partial<
    Pick<CatalogueField, 'archivedAt' | 'cardinality' | 'enumOptions' | 'kind'>
  > = {}
): CatalogueField {
  return {
    allowOverride: false,
    archivedAt: null,
    cardinality: 'one',
    defaultValues: [],
    enumOptions: [],
    expression: null,
    expressionVersion: null,
    fixedUnit: null,
    help: null,
    id,
    key,
    kind: 'short_text',
    label: key,
    presentation: {},
    referenceKinds: [],
    referenceTypeIds: [],
    replacedBy: null,
    required: false,
    sortOrder: 0,
    storage: 'stored',
    typeId: 'type',
    ...overrides,
  };
}

function type(
  id: string,
  key: string,
  label: string,
  fields: readonly CatalogueField[],
  archivedAt: string | null = null
): CatalogueType {
  return {
    archivedAt,
    capabilities: [],
    description: null,
    fields: fields.map((entry) => ({ ...entry, typeId: id })),
    id,
    key,
    label,
    legacyLabels: [],
    parentTypeId: null,
    presentation: {},
    replacedBy: null,
    revision: 1,
    sortOrder: 0,
  };
}

function repair(
  values: NonNullable<RepairCase['held']>['values'],
  overrides: Partial<Pick<RepairCase, 'kind' | 'typeId'>> = {}
): RepairCase {
  return {
    ...typeReplacedCase,
    typeId: 'type-network',
    held: { title: 'Held edit', values },
    ...overrides,
  };
}

const replacementMarker = {
  field: 'Type',
  value: 'Network',
  fit: 'replaced',
  replacement: 'Router',
  replacementTypeId: 'type-router',
} as const;

describe('changeTypeWrite', () => {
  it('carries a value to the replacement field with the same key, kind and cardinality', () => {
    const result = changeTypeWrite(
      repair([
        replacementMarker,
        {
          field: 'Wi-Fi standard',
          value: '802.11ax',
          fit: 'fits',
          fieldId: 'network-wifi',
          values: ['802.11ax'],
        },
      ]),
      [
        type('type-network', 'network', 'Network', [field('network-wifi', 'wifi')]),
        type('type-router', 'router', 'Router', [field('router-wifi', 'wifi')]),
      ]
    );

    expect(result).toEqual({
      kind: 'change-type',
      typeKey: 'router',
      replacement: 'Router',
      values: [{ fieldId: 'router-wifi', values: ['802.11ax'] }],
    });
  });

  it('names a value whose target differs in kind or cardinality', () => {
    const result = changeTypeWrite(
      repair([
        replacementMarker,
        {
          field: 'Ports',
          value: '4',
          fit: 'fits',
          fieldId: 'network-ports',
          values: [4],
        },
      ]),
      [
        type('type-network', 'network', 'Network', [field('network-ports', 'ports')]),
        type('type-router', 'router', 'Router', [
          field('router-ports', 'ports', { kind: 'integer', cardinality: 'many' }),
        ]),
      ]
    );

    expect(result).toEqual({ kind: 'unmatched', replacement: 'Router', fields: ['Ports'] });
  });

  it('maps a live enum option by key and blocks retired or absent options', () => {
    const sourceField = field('network-colour', 'colour', {
      kind: 'enum',
      enumOptions: [option('network-sage', 'sage'), option('network-old', 'old')],
    });
    const targetField = field('router-colour', 'colour', {
      kind: 'enum',
      enumOptions: [option('router-sage', 'sage'), option('router-old', 'old', '2026-09-25')],
    });
    const live = changeTypeWrite(
      repair([
        replacementMarker,
        {
          field: 'Colour',
          value: 'Sage',
          fit: 'fits',
          fieldId: sourceField.id,
          values: [{ optionId: 'network-sage' }],
        },
      ]),
      [
        type('type-network', 'network', 'Network', [sourceField]),
        type('type-router', 'router', 'Router', [targetField]),
      ]
    );
    expect(live).toMatchObject({
      kind: 'change-type',
      values: [{ fieldId: 'router-colour', values: [{ optionId: 'router-sage' }] }],
    });

    const retired = changeTypeWrite(
      repair([
        replacementMarker,
        {
          field: 'Colour',
          value: 'Old',
          fit: 'fits',
          fieldId: sourceField.id,
          values: [{ optionId: 'network-old' }],
        },
      ]),
      [
        type('type-network', 'network', 'Network', [sourceField]),
        type('type-router', 'router', 'Router', [targetField]),
      ]
    );
    expect(retired).toEqual({ kind: 'unmatched', replacement: 'Router', fields: ['Colour'] });
  });

  it('matches nothing by label or position', () => {
    const sourceField = field('network-ports', 'ports');
    const sameLabel = changeTypeWrite(
      repair([
        replacementMarker,
        { field: 'Ports', value: '4', fit: 'fits', fieldId: sourceField.id, values: [4] },
      ]),
      [
        type('type-network', 'network', 'Network', [sourceField]),
        type('type-router', 'router', 'Router', [field('router-connections', 'connections')]),
      ]
    );
    expect(sameLabel).toEqual({ kind: 'unmatched', replacement: 'Router', fields: ['Ports'] });

    const samePosition = changeTypeWrite(
      repair([
        replacementMarker,
        { field: 'Ports', value: '4', fit: 'fits', fieldId: sourceField.id, values: [4] },
      ]),
      [
        type('type-network', 'network', 'Network', [sourceField]),
        type('type-router', 'router', 'Router', [field('router-other', 'other')]),
      ]
    );
    expect(samePosition).toEqual({ kind: 'unmatched', replacement: 'Router', fields: ['Ports'] });
  });

  it('skips an archived target field with the same key', () => {
    const result = changeTypeWrite(
      repair([
        replacementMarker,
        { field: 'Ports', value: '4', fit: 'fits', fieldId: 'network-ports', values: [4] },
      ]),
      [
        type('type-network', 'network', 'Network', [field('network-ports', 'ports')]),
        type('type-router', 'router', 'Router', [
          field('router-ports', 'ports', { archivedAt: '2026-09-25' }),
        ]),
      ]
    );

    expect(result).toEqual({ kind: 'unmatched', replacement: 'Router', fields: ['Ports'] });
  });

  it('is null when the report or catalogue does not identify a safe replacement', () => {
    const values = [
      {
        field: 'Ports',
        value: '4',
        fit: 'fits',
        fieldId: 'network-ports',
        values: [4],
      },
    ];
    const cases: readonly [RepairCase, readonly CatalogueType[]][] = [
      [repair(values, { typeId: undefined }), []],
      [
        repair([{ ...replacementMarker, replacementTypeId: undefined }, ...values]),
        [type('type-network', 'network', 'Network', [field('network-ports', 'ports')])],
      ],
      [repair(values), [type('type-router', 'router', 'Router', [])]],
      [
        repair(values),
        [
          type('type-network', 'network', 'Network', [field('network-ports', 'ports')]),
          type('type-router', 'router', 'Router', [], '2026-09-25'),
        ],
      ],
      [
        repair([replacementMarker, { field: 'Ports', value: '4', fit: 'fits', values: [4] }]),
        [
          type('type-network', 'network', 'Network', [field('network-ports', 'ports')]),
          type('type-router', 'router', 'Router', [field('router-ports', 'ports')]),
        ],
      ],
      [
        repair([
          replacementMarker,
          {
            field: 'Ports',
            value: '4',
            fit: 'fits',
            fieldId: 'network-ports',
            values: [{ invalid: true }],
          },
        ]),
        [
          type('type-network', 'network', 'Network', [field('network-ports', 'ports')]),
          type('type-router', 'router', 'Router', [field('router-ports', 'ports')]),
        ],
      ],
    ];

    for (const [candidate, catalogue] of cases) {
      expect(changeTypeWrite(candidate, catalogue)).toBeNull();
    }
  });
});
