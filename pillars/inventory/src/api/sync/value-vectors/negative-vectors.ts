/**
 * Negative protocol-2 cases. Each malformed value is first sent to the real
 * command engine as an `item.create`, and the vector records the engine's
 * rejection reason, so a consumer's refusal is checked against a value the
 * producer is proven to refuse too.
 */
import { SUPPORTED_INVENTORY_PROTOCOL } from '../../../protocol/rollout.js';

import type { CatalogueFieldWire } from '../../../catalogue/authoring-types.js';
import type { PrimitiveKind } from '../../../catalogue/value-types.js';
import type { SyncItemFieldValue } from '../wire.js';
import type { FieldKeyName } from './catalogue-fields.js';
import type { ValueVectorCatalogue } from './catalogue.js';
import type { FixtureEngine } from './fixture-engine.js';

/** A stored value its field's kind does not admit, and the producer's own refusal of it. */
export interface MalformedValueVector {
  readonly category: 'malformed_value';
  readonly name: string;
  readonly kind: PrimitiveKind;
  readonly fieldValue: SyncItemFieldValue;
  readonly producerRejection: string;
}

/** A catalogue field whose `kind` is outside the closed primitive vocabulary. */
export interface UnknownKindVector {
  readonly category: 'unknown_kind';
  readonly name: string;
  /** A real field descriptor of the vector type with only its identity and `kind` changed. */
  readonly field: Omit<CatalogueFieldWire, 'kind'> & { readonly kind: string };
}

/** A page or catalogue minimum one protocol above what this producer and its clients support. */
export interface ProtocolAboveSupportedVector {
  readonly category: 'protocol_above_supported';
  readonly name: string;
  readonly supportedProtocol: number;
  readonly minimumProtocol: number;
}

export type NegativeValueVector =
  | MalformedValueVector
  | UnknownKindVector
  | ProtocolAboveSupportedVector;

interface MalformedSpec {
  readonly name: string;
  readonly kind: PrimitiveKind;
  readonly fieldKey: FieldKeyName;
  readonly value: unknown;
}

const MALFORMED: readonly MalformedSpec[] = [
  { name: 'short_text empty string', kind: 'short_text', fieldKey: 'shortTextOne', value: '' },
  { name: 'short_text as a number', kind: 'short_text', fieldKey: 'shortTextOne', value: 7 },
  { name: 'long_text as a boolean', kind: 'long_text', fieldKey: 'longTextOne', value: true },
  { name: 'integer as a string', kind: 'integer', fieldKey: 'integerOne', value: '42' },
  { name: 'integer fraction', kind: 'integer', fieldKey: 'integerOne', value: 1.5 },
  {
    name: 'integer beyond the safe range',
    kind: 'integer',
    fieldKey: 'integerOne',
    value: 9_007_199_254_740_992,
  },
  { name: 'decimal as a number', kind: 'decimal', fieldKey: 'decimalOne', value: 12 },
  { name: 'decimal in exponent form', kind: 'decimal', fieldKey: 'decimalOne', value: '1e3' },
  { name: 'decimal negative zero', kind: 'decimal', fieldKey: 'decimalOne', value: '-0' },
  {
    name: 'decimal with more than nine fraction digits',
    kind: 'decimal',
    fieldKey: 'decimalOne',
    value: '1.0000000001',
  },
  {
    name: 'decimal beyond eighteen significant digits',
    kind: 'decimal',
    fieldKey: 'decimalOne',
    value: '1234567890123456789.123456789',
  },
  { name: 'boolean as a string', kind: 'boolean', fieldKey: 'booleanOne', value: 'true' },
  { name: 'enum as a bare id', kind: 'enum', fieldKey: 'enumOne', value: 'alpha' },
  {
    name: 'measurement without a unit',
    kind: 'measurement',
    fieldKey: 'measurementOne',
    value: { amount: '4.5' },
  },
  {
    name: 'measurement in another unit',
    kind: 'measurement',
    fieldKey: 'measurementOne',
    value: { amount: '4.5', unit: 'g' },
  },
  { name: 'date that does not exist', kind: 'date', fieldKey: 'dateOne', value: '2026-02-30' },
  { name: 'date without padding', kind: 'date', fieldKey: 'dateOne', value: '2026-9-1' },
  {
    name: 'date_time without milliseconds',
    kind: 'date_time',
    fieldKey: 'dateTimeOne',
    value: '2026-09-24T10:11:12Z',
  },
  {
    name: 'date_time with an offset',
    kind: 'date_time',
    fieldKey: 'dateTimeOne',
    value: '2026-09-24T10:11:12.345+10:00',
  },
  { name: 'url over plain http', kind: 'url', fieldKey: 'urlOne', value: 'http://pops.example/' },
  { name: 'url that is not a url', kind: 'url', fieldKey: 'urlOne', value: 'not a url' },
  {
    name: 'reference as a bare id',
    kind: 'reference',
    fieldKey: 'referenceOne',
    value: '6c0a2f6e-9d1b-4f3a-8e57-1b2c3d4e5f60',
  },
];

function malformedVectors(
  engine: FixtureEngine,
  catalogue: ValueVectorCatalogue
): readonly MalformedValueVector[] {
  return MALFORMED.map((spec) => {
    const fieldId = catalogue.fieldIds[spec.fieldKey];
    return {
      category: 'malformed_value',
      name: spec.name,
      kind: spec.kind,
      fieldValue: {
        fieldId,
        source: 'stored',
        catalogueRevision: catalogue.liveRevision,
        values: [spec.value],
      },
      producerRejection: engine.rejectedCreate(catalogue, [{ fieldId, values: [spec.value] }]),
    };
  });
}

function unknownKindVector(template: CatalogueFieldWire): UnknownKindVector {
  return {
    category: 'unknown_kind',
    name: 'catalogue field of an unknown kind',
    field: {
      ...template,
      id: '10000000-0000-4000-8000-0000000000ff',
      key: 'spatialVector',
      label: 'Spatial vector',
      sortOrder: 99,
      kind: 'spatial_vector',
    },
  };
}

/** Every negative case, in a stable order. */
export function buildNegativeValueVectors(
  engine: FixtureEngine,
  catalogue: ValueVectorCatalogue,
  template: CatalogueFieldWire
): readonly NegativeValueVector[] {
  return [
    ...malformedVectors(engine, catalogue),
    unknownKindVector(template),
    {
      category: 'protocol_above_supported',
      name: 'minimum protocol one above the supported protocol',
      supportedProtocol: SUPPORTED_INVENTORY_PROTOCOL,
      minimumProtocol: SUPPORTED_INVENTORY_PROTOCOL + 1,
    },
  ];
}
