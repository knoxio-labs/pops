import type {
  DesignField,
  DesignType,
  ExpressionContext,
  ValueKind,
} from '@/kit/inventory/computed-editor/model';

type FieldExtras = Omit<Partial<DesignField>, 'id' | 'label' | 'kind'>;

function field(id: string, label: string, kind: ValueKind, extras: FieldExtras = {}): DesignField {
  return { id, label, kind, cardinality: 'one', storage: 'stored', ...extras };
}

function itemReference(typeIds: readonly string[]): FieldExtras {
  return { reference: { kinds: ['item'], typeIds } };
}

/** Fictional Electronics type: the owner of every computed field on this screen. */
export const electronicsType: DesignType = {
  id: 'electronics',
  label: 'Electronics',
  fields: [
    field('manufacturer', 'Manufacturer', 'short_text'),
    field('model', 'Model', 'short_text'),
    field('display_name', 'Display name', 'short_text', { storage: 'computed' }),
    field('powered', 'Powered', 'boolean'),
    field('has_warranty', 'Has warranty', 'boolean'),
    field('condition', 'Condition', 'enum', {
      options: [
        { id: 'opt-new', label: 'New' },
        { id: 'opt-good', label: 'Good' },
        { id: 'opt-worn', label: 'Worn' },
      ],
    }),
    field('unit_price', 'Unit price', 'decimal'),
    field('package_count', 'Package count', 'integer'),
    field('replacement_value', 'Replacement value', 'decimal', { storage: 'computed' }),
    field('insured_value', 'Insured value', 'decimal', { storage: 'computed' }),
    field('needs_attention', 'Needs attention', 'boolean', { storage: 'computed' }),
    field('per_unit_saving', 'Per-unit saving', 'decimal', { storage: 'computed' }),
    field('shelf_label', 'Shelf label', 'short_text', { storage: 'computed' }),
    field('part_of', 'Part of', 'reference', itemReference(['bundle'])),
    field('replaces', 'Replaces', 'reference', itemReference([])),
    field('stored_with', 'Stored with', 'reference', {
      reference: { kinds: ['item', 'location'], typeIds: [] },
    }),
    field('accessories', 'Accessories', 'reference', {
      ...itemReference(['electronics']),
      cardinality: 'many',
    }),
    field('connectors', 'Connectors', 'enum', { cardinality: 'many' }),
  ],
};

/** Fictional Bundle type, reached from Electronics through Part of. */
export const bundleType: DesignType = {
  id: 'bundle',
  label: 'Bundle',
  fields: [
    field('bundle_name', 'Bundle name', 'short_text'),
    field('replacement_quote', 'Replacement quote', 'decimal'),
    field('per_item_price', 'Per-item price', 'decimal', { storage: 'computed' }),
    field('featured_item', 'Featured item', 'reference', itemReference(['electronics'])),
    field('stored_in', 'Stored in', 'reference', itemReference(['case'])),
  ],
};

/** Fictional Case type, two references away from Electronics. */
export const caseType: DesignType = {
  id: 'case',
  label: 'Case',
  fields: [
    field('case_label', 'Case label', 'short_text'),
    field('shelf', 'Shelf', 'short_text'),
    field('home_case', 'Home case', 'reference', itemReference(['case'])),
  ],
};

/** Fictional Storage box type with fixed-unit measurements. */
export const storageBoxType: DesignType = {
  id: 'storage_box',
  label: 'Storage box',
  fields: [
    field('width', 'Width', 'measurement', { unit: 'cm' }),
    field('height', 'Height', 'measurement', { unit: 'cm' }),
    field('depth', 'Depth', 'measurement', { unit: 'cm' }),
    field('volume', 'Volume', 'measurement', { unit: 'cm', storage: 'computed' }),
  ],
};

const types = [electronicsType, bundleType, caseType, storageBoxType];

/** Builder context for a computed field owned by Electronics. */
export const electronicsContext: ExpressionContext = { types, ownerTypeId: 'electronics' };

/** Builder context for a computed field owned by Storage box. */
export const storageBoxContext: ExpressionContext = { types, ownerTypeId: 'storage_box' };
