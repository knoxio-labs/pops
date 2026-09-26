const uuid = { type: 'string', format: 'uuid' } as const;

/**
 * Ops accepted by a unary/binary expression node. Must match the producer's
 * published `ExpressionV1` contract (`inventory-contract-fidelity.test.ts`
 * reads it off the committed OpenAPI document, the same way every other
 * check in that file reads producer enforcement).
 */
export const EXPRESSION_UNARY_OPS = ['negate', 'not'] as const;
export const EXPRESSION_BINARY_OPS = [
  'add',
  'subtract',
  'multiply',
  'divide',
  'concat',
  'equal',
  'less_than',
  'and',
  'or',
] as const;

const primitiveWireValue = {
  description:
    'A stored primitive value: string, safe integer, boolean, {optionId} for an enum, ' +
    '{amount, unit} for a fixed-unit measurement, or {targetKind, targetId} for a reference. ' +
    'A decimal literal (e.g. 2.5) is not a number here — encode it as a string, like every ' +
    'other stored decimal amount.',
  oneOf: [
    { type: 'string' },
    {
      type: 'integer',
      minimum: Number.MIN_SAFE_INTEGER,
      maximum: Number.MAX_SAFE_INTEGER,
    },
    { type: 'boolean' },
    {
      type: 'object',
      additionalProperties: false,
      properties: { optionId: uuid },
      required: ['optionId'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: { amount: { type: 'string' }, unit: { type: 'string' } },
      required: ['amount', 'unit'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        targetKind: { type: 'string', enum: ['item', 'location'] },
        targetId: { type: 'string' },
      },
      required: ['targetKind', 'targetId'],
    },
  ],
} as const;

/** `put_field.defaultValues`: stored primitive values a client pre-fills on item create. */
export const fieldDefaultValues = {
  type: 'array',
  maxItems: 100,
  items: primitiveWireValue,
  description:
    'Values a client pre-fills on item create; [] clears. Only stored, non-reference fields ' +
    'take one, at most one entry on a single-value field. The server never applies them.',
} as const;

const expressionRef = { $ref: '#/$defs/expressionV1' } as const;

/**
 * The `if` node's wire keys, as computed properties rather than literal
 * ones below — a plain object with a real `then` property trips
 * `unicorn/no-thenable` (the linter cannot tell schema data from an
 * accidental thenable), and the wire key itself must match the producer's
 * published contract, not something this file may rename away.
 */
const THEN_KEY = 'then' as const;
const ELSE_KEY = 'else' as const;

/**
 * `$defs` for the v1 computed-field expression grammar (Inventory ADR-002
 * D-computed), keyed for `$ref` from `putField.expression` in
 * `inventory-catalogue-schema.ts`. Spread into whichever tool's root
 * `inputSchema` embeds `catalogueOperationSchema` — a bare JSON-Schema `$ref`
 * resolves against that document's root, not against this file's local
 * object, so the `$defs` must travel with it.
 *
 * Mirrors `pillars/inventory/src/catalogue/expression-types.ts`'s
 * `ExpressionV1` union: a literal, a same-item or bounded (max 2 hops)
 * reference read, a unary `negate`/`not`, a binary arithmetic/comparison/
 * boolean op, an `if`, or a `coalesce`. No other syntax — no arbitrary JS/SQL.
 */
export const expressionSchemaDefs = {
  expressionV1: {
    description:
      "Computed-field expression (v1). One of: {op:'literal', value} a constant; " +
      "{op:'read', path, fieldId} reads fieldId on the item reached by following " +
      "path (own item when path is [], at most 2 reference hops); {op:'negate'|'not', value} " +
      "a unary op; {op:'add'|'subtract'|'multiply'|'divide'|'concat'|'equal'|'less_than'|'and'|'or', " +
      "left, right} a binary op; {op:'if', condition, then, else}; " +
      "{op:'coalesce', values} the first of two or more expressions that has a value. " +
      'Missing dependencies make the computed value unavailable rather than erroring; ' +
      'only coalesce skips an unavailable argument.',
    oneOf: [
      {
        type: 'object',
        additionalProperties: false,
        properties: { op: { const: 'literal' }, value: primitiveWireValue },
        required: ['op', 'value'],
      },
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          op: { const: 'read' },
          path: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
            maxItems: 2,
            description: 'Stable reference-field IDs to follow; [] reads the same item.',
          },
          fieldId: uuid,
        },
        required: ['op', 'path', 'fieldId'],
      },
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          op: { type: 'string', enum: [...EXPRESSION_UNARY_OPS] },
          value: expressionRef,
        },
        required: ['op', 'value'],
      },
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          op: { type: 'string', enum: [...EXPRESSION_BINARY_OPS] },
          left: expressionRef,
          right: expressionRef,
        },
        required: ['op', 'left', 'right'],
      },
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          op: { const: 'if' },
          condition: expressionRef,
          [THEN_KEY]: expressionRef,
          [ELSE_KEY]: expressionRef,
        },
        required: ['op', 'condition', THEN_KEY, ELSE_KEY],
      },
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          op: { const: 'coalesce' },
          values: { type: 'array', items: expressionRef, minItems: 2 },
        },
        required: ['op', 'values'],
      },
    ],
  },
} as const;

/** `putField.expression`'s schema: an expression, or `null` to clear it. */
export const nullableExpression = { anyOf: [expressionRef, { type: 'null' }] } as const;
