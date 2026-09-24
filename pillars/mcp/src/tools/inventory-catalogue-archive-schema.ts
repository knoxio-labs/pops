const uuid = { type: 'string', format: 'uuid' } as const;

/** An archive of a type or field, naming the definition that replaces it when there is one. */
export const archiveDefinition = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: { enum: ['archive_type', 'archive_field'] },
    id: uuid,
    replacedBy: {
      ...uuid,
      description:
        'The live type (archive_type) or field (archive_field) that takes over. A replacement field belongs to the same type, or to the type that replaces it. Recorded once; queued phone changes move onto it when it accepts their values as they are.',
    },
  },
  required: ['kind', 'id'],
} as const;

/** An archive of an enum option, which records no replacement. */
export const archiveEnumOption = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: { const: 'archive_enum_option' },
    id: uuid,
  },
  required: ['kind', 'id'],
} as const;
