import { nullableExpression } from './inventory-catalogue-expression-schema.js';

export {
  EXPRESSION_BINARY_OPS,
  EXPRESSION_UNARY_OPS,
  expressionSchemaDefs,
} from './inventory-catalogue-expression-schema.js';

const uuid = { type: 'string', format: 'uuid' } as const;
const nullableString = { type: ['string', 'null'] } as const;
const archivedAt = { type: ['string', 'null'] } as const;
const presentation = { type: 'object', additionalProperties: true } as const;

const putType = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: { const: 'put_type' },
    id: uuid,
    key: { type: 'string', minLength: 1, maxLength: 100 },
    label: { type: 'string', minLength: 1, maxLength: 200 },
    description: nullableString,
    sortOrder: { type: 'integer', minimum: 0 },
    capabilities: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 64 } },
    legacyLabels: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 200 } },
    presentation,
    archivedAt,
  },
  required: ['kind'],
} as const;

const putField = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: { const: 'put_field' },
    id: uuid,
    typeId: uuid,
    key: { type: 'string', minLength: 1, maxLength: 100 },
    label: { type: 'string', minLength: 1, maxLength: 200 },
    help: nullableString,
    sortOrder: { type: 'integer', minimum: 0 },
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
    fixedUnit: nullableString,
    referenceKinds: {
      type: 'array',
      maxItems: 2,
      items: { type: 'string', enum: ['item', 'location'] },
    },
    referenceTypeIds: { type: 'array', maxItems: 100, items: uuid },
    expressionVersion: { type: ['integer', 'null'], minimum: 1 },
    expression: nullableExpression,
    allowOverride: { type: 'boolean' },
    presentation,
    archivedAt,
  },
  required: ['kind', 'typeId'],
} as const;

const putEnumOption = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: { const: 'put_enum_option' },
    id: uuid,
    fieldId: uuid,
    key: { type: 'string', minLength: 1, maxLength: 100 },
    label: { type: 'string', minLength: 1, maxLength: 200 },
    sortOrder: { type: 'integer', minimum: 0 },
    archivedAt,
  },
  required: ['kind', 'fieldId'],
} as const;

const archiveDefinition = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: { enum: ['archive_type', 'archive_field', 'archive_enum_option'] },
    id: uuid,
  },
  required: ['kind', 'id'],
} as const;

const reorderDefinitions = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: { const: 'reorder' },
    definition: { type: 'string', enum: ['type', 'field', 'enum_option'] },
    parentId: { type: ['string', 'null'], format: 'uuid' },
    ids: { type: 'array', minItems: 1, maxItems: 500, items: uuid },
  },
  required: ['kind', 'definition', 'ids'],
} as const;

/** JSON schema matching every discriminant and required field in the REST draft operation union. */
export const catalogueOperationSchema = {
  oneOf: [putType, putField, putEnumOption, archiveDefinition, reorderDefinitions],
} as const;

const migrationStepSchema = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: { kind: { const: 'copy' }, fromFieldId: uuid, toFieldId: uuid },
      required: ['kind', 'fromFieldId', 'toFieldId'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { const: 'set_default' },
        fieldId: uuid,
        values: { type: 'array', items: {} },
      },
      required: ['kind', 'fieldId', 'values'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { const: 'map_enum' },
        fieldId: uuid,
        optionIds: { type: 'object', additionalProperties: uuid },
      },
      required: ['kind', 'fieldId', 'optionIds'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { const: 'convert_decimal' },
        fromFieldId: uuid,
        toFieldId: uuid,
        factor: { type: 'string' },
      },
      required: ['kind', 'fromFieldId', 'toFieldId', 'factor'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { const: 'replace_reference' },
        fieldId: uuid,
        targetKind: { type: 'string', enum: ['item', 'location'] },
        fromTargetId: uuid,
        toTargetId: uuid,
      },
      required: ['kind', 'fieldId', 'targetKind', 'fromTargetId', 'toTargetId'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: { kind: { const: 'drop_value' }, fieldId: uuid },
      required: ['kind', 'fieldId'],
    },
  ],
} as const;

/** JSON schema matching the closed, named migration submitted during REST publication. */
export const catalogueMigrationSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 },
    fromRevision: { type: 'integer', minimum: 1 },
    toRevision: { type: 'integer', minimum: 1 },
    affectedTypeIds: { type: 'array', items: uuid },
    affectedFieldIds: { type: 'array', items: uuid },
    steps: { type: 'array', items: migrationStepSchema },
  },
  required: ['name', 'fromRevision', 'toRevision', 'affectedTypeIds', 'affectedFieldIds', 'steps'],
} as const;
