/** Closed Inventory ADR-002 primitive vocabulary represented by the playground. */
export type CatalogueFieldKind =
  | 'short_text'
  | 'long_text'
  | 'integer'
  | 'decimal'
  | 'boolean'
  | 'enum'
  | 'measurement'
  | 'date'
  | 'date_time'
  | 'url'
  | 'reference';

/** What a reference field may point at, mirroring `referenceKinds` and `referenceTypeIds`. */
export interface CatalogueReferenceTargets {
  kinds: readonly ('item' | 'location')[];
  /** Allowed item types; empty allows every item type. Never constrains locations. */
  typeIds: readonly string[];
}

/** The fixed unit of a measurement field and the physical dimension it resolves to. */
export interface CatalogueMeasurementUnit {
  symbol: string;
  dimension: string;
}

/** Fictional catalogue field shown in the type-editor outline and inspectors. */
export interface CatalogueFieldSummary {
  id: string;
  key: string;
  label: string;
  helpText: string;
  kind: CatalogueFieldKind;
  cardinality: 'one' | 'many';
  required: boolean;
  highlighted: boolean;
  storage: 'stored' | 'computed';
  archived?: boolean;
  unit?: CatalogueMeasurementUnit;
  reference?: CatalogueReferenceTargets;
}

type FieldOptions = Partial<
  Pick<
    CatalogueFieldSummary,
    'cardinality' | 'required' | 'highlighted' | 'storage' | 'archived' | 'unit' | 'reference'
  >
>;

type FieldIdentity = readonly [
  key: string,
  label: string,
  helpText: string,
  kind: CatalogueFieldKind,
];

function field(identity: FieldIdentity, options: FieldOptions = {}): CatalogueFieldSummary {
  const [key, label, helpText, kind] = identity;
  return {
    id: `field-${key.replaceAll('_', '-')}`,
    key,
    label,
    helpText,
    kind,
    ...options,
    cardinality: options.cardinality ?? 'one',
    required: options.required ?? false,
    highlighted: options.highlighted ?? false,
    storage: options.storage ?? 'stored',
  };
}

/** Electronics draft fields spanning the complete primitive vocabulary. */
export const electronicsFields: readonly CatalogueFieldSummary[] = [
  field(
    [
      'manufacturer',
      'Manufacturer',
      'The company shown on the product or packaging.',
      'short_text',
    ],
    { required: true, highlighted: true }
  ),
  field(['model', 'Model', 'The manufacturer model name or number.', 'short_text'], {
    highlighted: true,
  }),
  field(['notes', 'Notes', 'Long-form setup, repair and ownership notes.', 'long_text']),
  field(
    [
      'connectors',
      'Connectors',
      'Physical data and power connectors available on this item.',
      'enum',
    ],
    { cardinality: 'many' }
  ),
  field(['powered', 'Powered', 'Whether this item requires electrical power.', 'boolean']),
  field(['weight', 'Weight', 'Shipping weight of one unit.', 'measurement'], {
    unit: { symbol: 'kg', dimension: 'mass' },
  }),
  field(['purchased_on', 'Purchased on', 'Calendar date on the purchase receipt.', 'date']),
  field([
    'registered_at',
    'Registered at',
    'Exact UTC time the warranty was registered.',
    'date_time',
  ]),
  field(['product_url', 'Product page', 'Canonical HTTPS page for this model.', 'url']),
  field(['works_with', 'Works with', 'Devices this accessory is compatible with.', 'reference'], {
    cardinality: 'many',
    reference: { kinds: ['item'], typeIds: ['type-electronics'] },
  }),
  field(
    [
      'stored_with',
      'Stored with',
      'The cabinet or place this item is kept alongside.',
      'reference',
    ],
    { reference: { kinds: ['item', 'location'], typeIds: ['type-furniture'] } }
  ),
  field(['home_location', 'Home location', 'Where this item lives when not in use.', 'reference'], {
    reference: { kinds: ['location'], typeIds: [] },
  }),
  field(['unit_price', 'Unit price', 'Replacement price for one unit.', 'decimal']),
  field(['package_count', 'Package count', 'Number of units in the package.', 'integer']),
  field(
    [
      'replacement_value',
      'Replacement value',
      'Calculated from unit price and package count.',
      'decimal',
    ],
    { highlighted: true, storage: 'computed' }
  ),
  field(['voltage', 'Voltage', 'Nominal input voltage.', 'measurement'], {
    archived: true,
    unit: { symbol: 'V', dimension: 'voltage' },
  }),
];

/** Looks up a fictional Electronics field by key, failing loudly on a typo in a state. */
export function electronicsField(key: string): CatalogueFieldSummary {
  const found = electronicsFields.find((candidate) => candidate.key === key);
  if (found === undefined) throw new Error(`Missing fictional field ${key}`);
  return found;
}
