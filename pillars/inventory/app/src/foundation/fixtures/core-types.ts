/**
 * Published item types used by the inventory foundation fixtures. Electronics
 * includes one field for every catalogue field kind.
 */
import type { FieldKind } from '../../catalogue-editor/FieldFormContext';

/** One field of a published type as a form or detail surface reads it. */
export interface CoreFieldModel {
  key: string;
  label: string;
  kind: FieldKind;
  cardinality: 'one' | 'many';
  unit?: string;
  computed?: boolean;
}

/** One published type and the fields it exposes. */
export interface CoreTypeModel {
  id: string;
  label: string;
  containment: boolean;
  fields: readonly CoreFieldModel[];
}

const one = (key: string, label: string, kind: FieldKind): CoreFieldModel => ({
  key,
  label,
  kind,
  cardinality: 'one',
});

export const electronicsType: CoreTypeModel = {
  id: 'type-electronics',
  label: 'Electronics',
  containment: false,
  fields: [
    one('manufacturer', 'Manufacturer', 'short_text'),
    one('notes', 'Notes', 'long_text'),
    one('ports', 'Ports', 'integer'),
    one('unit_price', 'Unit price', 'decimal'),
    one('powered', 'Needs power', 'boolean'),
    { key: 'connectors', label: 'Connectors', kind: 'enum', cardinality: 'many' },
    { key: 'weight', label: 'Weight', kind: 'measurement', cardinality: 'one', unit: 'kg' },
    one('purchased_on', 'Purchased on', 'date'),
    one('registered_at', 'Warranty registered', 'date_time'),
    one('manual_url', 'Manual', 'url'),
    { key: 'works_with', label: 'Works with', kind: 'reference', cardinality: 'many' },
    {
      key: 'replacement_value',
      label: 'Replacement value',
      kind: 'decimal',
      cardinality: 'one',
      computed: true,
    },
  ],
};

export const coreTypes: readonly CoreTypeModel[] = [
  electronicsType,
  {
    id: 'type-box',
    label: 'Moving box',
    containment: true,
    fields: [one('room', 'For room', 'short_text')],
  },
  { id: 'type-tub', label: 'Storage tub', containment: true, fields: [] },
  {
    id: 'type-cable',
    label: 'Cable',
    containment: false,
    fields: [one('length', 'Length', 'measurement')],
  },
  { id: 'type-kitchen', label: 'Kitchenware', containment: false, fields: [] },
  {
    id: 'type-tools',
    label: 'Tools',
    containment: false,
    fields: [one('brand', 'Brand', 'short_text')],
  },
  { id: 'type-furniture', label: 'Furniture', containment: false, fields: [] },
  {
    id: 'type-books',
    label: 'Books',
    containment: false,
    fields: [one('author', 'Author', 'short_text')],
  },
  { id: 'type-linen', label: 'Linen', containment: false, fields: [] },
];

/** Returns the fixture label for a type ID, or null for an untyped item. */
export function typeLabel(typeId: string | null): string | null {
  if (typeId === null) return null;
  return coreTypes.find((type) => type.id === typeId)?.label ?? null;
}
