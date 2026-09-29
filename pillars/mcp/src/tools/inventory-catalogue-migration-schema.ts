const uuid = { type: 'string', format: 'uuid' } as const;

/** JSON schema for the closed, deterministic catalogue migration step union. */
export const migrationStepSchema = {
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
        kind: { const: 'copy_legacy_value' },
        source: { type: 'string', enum: ['replacementValue', 'resaleValue'] },
        toFieldId: uuid,
      },
      required: ['kind', 'source', 'toFieldId'],
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
