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

const beddingForm: FormTypeDef = {
  id: 'type-bedding',
  label: 'Bedding',
  parentTypeId: null,
  containment: false,
  codeStem: 'BD',
  fields: [
    one('destination', 'Destination', 'reference'),
    many('material', 'Material', 'enum'),
    many('colour', 'Colour', 'enum'),
    one('pattern', 'Pattern', 'short_text'),
    one('weather', 'Weather', 'enum'),
    one('bed_size', 'Bed size', 'enum'),
  ],
};

const pillowsCushionsForm: FormTypeDef = {
  id: 'type-pillows-cushions',
  label: 'Pillows & cushions',
  parentTypeId: null,
  containment: false,
  codeStem: 'PC',
  fields: [
    one('destination', 'Destination', 'reference'),
    many('material', 'Material', 'enum'),
    many('colour', 'Colour', 'enum'),
    one('pattern', 'Pattern', 'short_text'),
  ],
};

interface TreeSubtypeOptions {
  id: string;
  label: string;
  parentTypeId: string;
  codeStem: string;
  fields: readonly FormFieldDef[];
}

const treeSubtype = ({
  id,
  label,
  parentTypeId,
  codeStem,
  fields,
}: TreeSubtypeOptions): FormTypeDef => ({
  id,
  label,
  parentTypeId,
  containment: false,
  codeStem,
  fields,
});

/** The inventory type-tree forms and their local fields. */
export const inventoryFormTypes: readonly FormTypeDef[] = [
  beddingForm,
  treeSubtype({
    id: 'type-sheet',
    label: 'Sheet',
    parentTypeId: 'type-bedding',
    codeStem: 'SH',
    fields: [one('fitted', 'Fitted', 'boolean')],
  }),
  treeSubtype({
    id: 'type-quilt',
    label: 'Quilt',
    parentTypeId: 'type-bedding',
    codeStem: 'QL',
    fields: [one('fill', 'Fill', 'short_text')],
  }),
  treeSubtype({
    id: 'type-quilt-cover',
    label: 'Quilt cover',
    parentTypeId: 'type-bedding',
    codeStem: 'QC',
    fields: [one('closure', 'Closure', 'enum')],
  }),
  treeSubtype({
    id: 'type-blanket',
    label: 'Blanket',
    parentTypeId: 'type-bedding',
    codeStem: 'BL',
    fields: [
      one('weight', 'Weight', 'measurement'),
      one('waterproof', 'Waterproof', 'boolean'),
      one('decorative', 'Decorative', 'boolean'),
    ],
  }),
  treeSubtype({
    id: 'type-mattress-protector',
    label: 'Mattress protector',
    parentTypeId: 'type-bedding',
    codeStem: 'MP',
    fields: [one('waterproof', 'Waterproof', 'boolean')],
  }),
  pillowsCushionsForm,
  treeSubtype({
    id: 'type-pillows',
    label: 'Pillows',
    parentTypeId: 'type-pillows-cushions',
    codeStem: 'PL',
    fields: [one('pillow_size', 'Pillow size', 'enum')],
  }),
  treeSubtype({
    id: 'type-pillow',
    label: 'Pillow',
    parentTypeId: 'type-pillows',
    codeStem: 'P',
    fields: [one('fill', 'Fill', 'short_text')],
  }),
  treeSubtype({
    id: 'type-pillowcase',
    label: 'Pillowcase',
    parentTypeId: 'type-pillows',
    codeStem: 'PC',
    fields: [one('closure', 'Closure', 'enum')],
  }),
  treeSubtype({
    id: 'type-pillow-protector',
    label: 'Pillow protector',
    parentTypeId: 'type-pillows',
    codeStem: 'PP',
    fields: [one('waterproof', 'Waterproof', 'boolean')],
  }),
  treeSubtype({
    id: 'type-cushions',
    label: 'Cushions',
    parentTypeId: 'type-pillows-cushions',
    codeStem: 'CU',
    fields: [
      one('width_cm', 'Width cm', 'measurement'),
      one('length_cm', 'Length cm', 'measurement'),
    ],
  }),
  treeSubtype({
    id: 'type-cushion',
    label: 'Cushion',
    parentTypeId: 'type-cushions',
    codeStem: 'C',
    fields: [one('fill', 'Fill', 'short_text')],
  }),
  treeSubtype({
    id: 'type-cushion-cover',
    label: 'Cushion cover',
    parentTypeId: 'type-cushions',
    codeStem: 'CC',
    fields: [one('closure', 'Closure', 'enum')],
  }),
];
