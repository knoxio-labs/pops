/**
 * The published types the item form offers, with every field the form has
 * to draw. Electronics carries one field of each primitive kind in its
 * `one` form plus a computed value; Camera kit carries each kind in its
 * `many` form (yes / no has none: the catalogue fixes it at one). Ids match
 * the foundation's core types, so a type named here is the same type on
 * every other screen.
 */
import type { FormFieldDef, FormTypeDef } from '@/kit/inventory/field-editors/field-model';

const one = (id: string, label: string, kind: FormFieldDef['kind']): FormFieldDef => ({
  id,
  label,
  kind,
  cardinality: 'one',
});

const many = (id: string, label: string, kind: FormFieldDef['kind']): FormFieldDef => ({
  id,
  label,
  kind,
  cardinality: 'many',
});

/** Connector options, one of them retired: it stays on items that hold it but cannot be chosen again. */
export const connectorOptions = [
  { id: 'usb-c', label: 'USB-C' },
  { id: 'usb-a', label: 'USB-A' },
  { id: 'hdmi', label: 'HDMI' },
  { id: 'displayport', label: 'DisplayPort' },
  { id: 'ethernet', label: 'Ethernet' },
  { id: 'audio', label: '3.5 mm audio' },
  { id: 'mini-hdmi', label: 'Mini HDMI', retired: true },
] as const;

export const electronicsForm: FormTypeDef = {
  id: 'type-electronics',
  label: 'Electronics',
  containment: false,
  codeStem: 'E',
  fields: [
    one('manufacturer', 'Manufacturer', 'short_text'),
    one('model', 'Model', 'short_text'),
    {
      ...many('works_with', 'Works with', 'reference'),
      reference: { kinds: ['item'], typeIds: ['type-electronics'] },
    },
    {
      ...one('stored_with', 'Stored with', 'reference'),
      reference: { kinds: ['item', 'location'], typeIds: ['type-furniture'] },
    },
    {
      ...one('condition', 'Condition', 'enum'),
      options: [
        { id: 'new', label: 'New' },
        { id: 'good', label: 'Good' },
        { id: 'worn', label: 'Worn' },
        { id: 'repair', label: 'Needs repair' },
      ],
    },
    { ...many('connectors', 'Connectors', 'enum'), options: connectorOptions },
    one('ports', 'Ports', 'integer'),
    one('unit_price', 'Unit price', 'decimal'),
    one('package_count', 'Package count', 'integer'),
    {
      ...one('replacement_value', 'Replacement value', 'decimal'),
      computed: { allowOverride: true, reads: ['Unit price', 'Package count'] },
    },
    one('powered', 'Needs power', 'boolean'),
    { ...one('weight', 'Weight', 'measurement'), unit: 'kg' },
    one('purchased_on', 'Purchased on', 'date'),
    one('registered_at', 'Warranty registered', 'date_time'),
    one('manual', 'Manual', 'url'),
    one('setup_notes', 'Setup notes', 'long_text'),
  ],
};

export const cameraKitForm: FormTypeDef = {
  id: 'type-camera',
  label: 'Camera kit',
  containment: false,
  codeStem: 'C',
  fields: [
    many('serials', 'Serial numbers', 'short_text'),
    {
      ...many('mounts', 'Lens mounts', 'enum'),
      options: [
        { id: 'x', label: 'Fujifilm X' },
        { id: 'e', label: 'Sony E' },
        { id: 'rf', label: 'Canon RF' },
        { id: 'm42', label: 'M42' },
      ],
    },
    many('battery_cycles', 'Battery cycles', 'integer'),
    many('apertures', 'Widest apertures', 'decimal'),
    { ...many('filter_sizes', 'Filter sizes', 'measurement'), unit: 'mm' },
    one('weather_sealed', 'Weather sealed', 'boolean'),
    many('serviced_on', 'Serviced on', 'date'),
    many('firmware_updated', 'Firmware updated', 'date_time'),
    many('manuals', 'Manuals', 'url'),
    {
      ...many('works_with', 'Works with', 'reference'),
      reference: { kinds: ['item'], typeIds: ['type-electronics', 'type-camera'] },
    },
    many('service_notes', 'Service notes', 'long_text'),
  ],
};

export const movingBoxForm: FormTypeDef = {
  id: 'type-box',
  label: 'Moving box',
  containment: true,
  codeStem: 'K',
  fields: [one('room', 'For room', 'short_text'), one('packed_on', 'Packed on', 'date')],
};

const plain = (id: string, label: string, codeStem: string): FormTypeDef => ({
  id,
  label,
  containment: false,
  codeStem,
  fields: [],
});

/** Every type the type picker lists, in its order. */
export const formTypes: readonly FormTypeDef[] = [
  electronicsForm,
  cameraKitForm,
  movingBoxForm,
  { id: 'type-tub', label: 'Storage tub', containment: true, codeStem: 'T', fields: [] },
  {
    id: 'type-cable',
    label: 'Cable',
    containment: false,
    codeStem: 'CB',
    fields: [{ ...one('length', 'Length', 'measurement'), unit: 'm' }],
  },
  plain('type-kitchen', 'Kitchenware', 'KW'),
  plain('type-tools', 'Tools', 'D'),
  plain('type-furniture', 'Furniture', 'F'),
  plain('type-books', 'Books', 'B'),
  plain('type-linen', 'Linen', 'L'),
];

/** A type's label by id, for reference refusals. */
export function formTypeLabel(typeId: string): string {
  return formTypes.find((type) => type.id === typeId)?.label ?? 'Unknown type';
}
