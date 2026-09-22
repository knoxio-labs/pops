const uuid = { type: 'string', format: 'uuid' } as const;

/** JSON schema for one persisted catalogue draft operation. */
export const catalogueOperationSchema = {
  type: 'object',
  description:
    'One catalogue edit: put_type, put_field, put_enum_option, archive_type, archive_field, archive_enum_option, or reorder.',
  properties: {
    kind: {
      type: 'string',
      enum: [
        'put_type',
        'put_field',
        'put_enum_option',
        'archive_type',
        'archive_field',
        'archive_enum_option',
        'reorder',
      ],
    },
    id: uuid,
    typeId: uuid,
    fieldId: uuid,
    key: { type: 'string' },
    label: { type: 'string' },
    description: { type: ['string', 'null'] },
    help: { type: ['string', 'null'] },
    sortOrder: { type: 'number' },
    capabilities: { type: 'array', items: { type: 'string' } },
    legacyLabels: { type: 'array', items: { type: 'string' } },
    presentation: { type: 'object', additionalProperties: true },
    archivedAt: { type: ['string', 'null'] },
    fieldKind: {
      type: 'string',
      enum: [
        'short_text',
        'long_text',
        'integer',
        'decimal',
        'boolean',
        'enum',
        'measurement',
        'date',
        'date_time',
        'url',
        'reference',
      ],
    },
    cardinality: { type: 'string', enum: ['one', 'many'] },
    required: { type: 'boolean' },
    storage: { type: 'string', enum: ['stored', 'computed'] },
    fixedUnit: { type: ['string', 'null'] },
    referenceKinds: {
      type: 'array',
      items: { type: 'string', enum: ['item', 'location'] },
    },
    referenceTypeIds: { type: 'array', items: uuid },
    expressionVersion: { type: ['number', 'null'] },
    expression: {},
    allowOverride: { type: 'boolean' },
    definition: { type: 'string', enum: ['type', 'field', 'enum_option'] },
    parentId: { type: ['string', 'null'], format: 'uuid' },
    ids: { type: 'array', items: uuid },
  },
  required: ['kind'],
} as const;

const migrationStepSchema = {
  type: 'object',
  properties: {
    kind: {
      type: 'string',
      enum: [
        'copy',
        'set_default',
        'map_enum',
        'convert_decimal',
        'replace_reference',
        'drop_value',
      ],
    },
    fromFieldId: uuid,
    toFieldId: uuid,
    fieldId: uuid,
    values: { type: 'array', items: {} },
    optionIds: { type: 'object', additionalProperties: { type: 'string', format: 'uuid' } },
    factor: { type: 'string' },
    targetKind: { type: 'string', enum: ['item', 'location'] },
    fromTargetId: uuid,
    toTargetId: uuid,
  },
  required: ['kind'],
} as const;

/** JSON schema for the closed, named migration submitted during publication. */
export const catalogueMigrationSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    fromRevision: { type: 'number' },
    toRevision: { type: 'number' },
    affectedTypeIds: { type: 'array', items: uuid },
    affectedFieldIds: { type: 'array', items: uuid },
    steps: { type: 'array', items: migrationStepSchema },
  },
  required: ['name', 'fromRevision', 'toRevision', 'affectedTypeIds', 'affectedFieldIds', 'steps'],
} as const;
