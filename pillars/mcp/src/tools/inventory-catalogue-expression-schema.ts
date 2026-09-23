const uuid = { type: 'string', format: 'uuid' } as const;

/**
 * Ops accepted by a unary/binary expression node. Must match
 * `pillars/inventory/src/catalogue/expression-parser.ts`'s `UNARY_OPS` /
 * `BINARY_OPS` sets exactly — MCP cannot import `@pops/inventory` at runtime
 * (see `inventory-contract-fidelity.test.ts`'s header), so these are kept in
 * sync by that test reading the producer source text directly rather than by
 * a shared import.
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
    'A stored primitive value: string, number, boolean, {optionId} for an enum, ' +
    '{amount, unit} for a fixed-unit measurement, or {targetKind, targetId} for a reference.',
  oneOf: [
    { type: 'string' },
    { type: 'number' },
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

const expressionRef = { $ref: '#/$defs/expressionV1' } as const;

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
 * boolean op, or an `if`. No other syntax — no arbitrary JS/SQL.
 */
export const expressionSchemaDefs = {
  expressionV1: {
    description:
      "Computed-field expression (v1). One of: {op:'literal', value} a constant; " +
      "{op:'read', path, fieldId} reads fieldId on the item reached by following " +
      "path (own item when path is [], at most 2 reference hops); {op:'negate'|'not', value} " +
      "a unary op; {op:'add'|'subtract'|'multiply'|'divide'|'concat'|'equal'|'less_than'|'and'|'or', " +
      "left, right} a binary op; {op:'if', condition, thenBranch, elseBranch}. " +
      'Missing dependencies make the computed value unavailable rather than erroring.',
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
          thenBranch: expressionRef,
          elseBranch: expressionRef,
        },
        required: ['op', 'condition', 'thenBranch', 'elseBranch'],
      },
    ],
  },
} as const;

/** `putField.expression`'s schema: an expression, or `null` to clear it. */
export const nullableExpression = { anyOf: [expressionRef, { type: 'null' }] } as const;
