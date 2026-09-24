import { z } from 'zod';

/**
 * The bound on reference hops a `read` expression node may traverse (own
 * item when `path` is empty). Mirrors
 * `src/catalogue/expression-parser.ts`'s `MAX_REFERENCE_HOPS` — that file is
 * the runtime evaluator's copy; this one is what the wire contract, and
 * therefore every generated client, actually publishes.
 */
export const EXPRESSION_MAX_REFERENCE_HOPS = 2;

/** Ops accepted by a unary expression node. */
export const EXPRESSION_UNARY_OPS = ['negate', 'not'] as const;

/** Ops accepted by a binary expression node. */
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

/**
 * The `if` node's wire keys, as computed properties rather than literal ones
 * below — an object literal with a real `then` property trips
 * `unicorn/no-thenable` (the linter cannot tell a schema-data key from an
 * accidental thenable), and the wire key itself is not ours to rename: it
 * must match `expression-parser.ts`'s `parseConditional`.
 */
export const THEN_KEY = 'then' as const;
export const ELSE_KEY = 'else' as const;

const PrimitiveWireValueSchema = z.union([
  z.string(),
  // Matches expression-parser.ts's primitive(): typeof value === 'number' &&
  // Number.isSafeInteger(value) — a decimal literal like 2.5 must be typed
  // as a string wire value, same as any other stored decimal amount.
  z.number().safe(),
  z.boolean(),
  z.object({ optionId: z.uuid() }).strict(),
  z.object({ amount: z.string(), unit: z.string() }).strict(),
  z.object({ targetKind: z.enum(['item', 'location']), targetId: z.string() }).strict(),
]);

/** A parsed, structurally valid v1 computed-field expression node. */
export type ExpressionV1Shape =
  | { readonly op: 'literal'; readonly value: z.infer<typeof PrimitiveWireValueSchema> }
  | { readonly op: 'read'; readonly path: readonly string[]; readonly fieldId: string }
  | { readonly op: (typeof EXPRESSION_UNARY_OPS)[number]; readonly value: ExpressionV1Shape }
  | {
      readonly op: (typeof EXPRESSION_BINARY_OPS)[number];
      readonly left: ExpressionV1Shape;
      readonly right: ExpressionV1Shape;
    }
  | {
      readonly op: 'if';
      readonly condition: ExpressionV1Shape;
      /** Wire key is `then`/`else`, not `thenBranch`/`elseBranch` — that pair is
       * `expression-types.ts`'s parsed-AST field naming; `expression-parser.ts`'s
       * `parseConditional` validates the incoming JSON with `exactKeys(value,
       * ['condition', 'else', 'op', 'then'], path)`. */
      readonly then: ExpressionV1Shape;
      readonly else: ExpressionV1Shape;
    }
  | { readonly op: 'coalesce'; readonly values: readonly ExpressionV1Shape[] };

/**
 * The v1 computed-field expression grammar (Inventory ADR-002 D-computed),
 * as a real wire schema rather than `z.unknown()` — so every consumer
 * (generated OpenAPI, the MCP tool schema and its contract-fidelity guard)
 * can read the grammar off the published contract instead of reaching into
 * `expression-parser.ts`'s private `UNARY_OPS`/`BINARY_OPS`/
 * `MAX_REFERENCE_HOPS`. Mirrors `expression-types.ts`'s `ExpressionV1` union:
 * a literal, a same-item or bounded reference read, a unary op, a binary op,
 * an `if`, or a `coalesce` of two or more expressions. No other syntax — no
 * arbitrary JS/SQL.
 *
 * Recursive, so it follows `LocationTreeNodeSchema`'s `z.lazy` +
 * `.meta({ id })` pattern (`rest-locations.ts`) — the pillar's existing
 * precedent for a schema `generate-openapi.ts`'s `hoistRecursiveDefinitions`
 * lifts into `components.schemas` instead of infinitely inlining.
 */
export const ExpressionV1Schema: z.ZodType<ExpressionV1Shape> = z
  .lazy(() =>
    z.union([
      z.object({ op: z.literal('literal'), value: PrimitiveWireValueSchema }).strict(),
      z
        .object({
          op: z.literal('read'),
          path: z.array(z.uuid()).max(EXPRESSION_MAX_REFERENCE_HOPS),
          fieldId: z.uuid(),
        })
        .strict(),
      z.object({ op: z.enum(EXPRESSION_UNARY_OPS), value: ExpressionV1Schema }).strict(),
      z
        .object({
          op: z.enum(EXPRESSION_BINARY_OPS),
          left: ExpressionV1Schema,
          right: ExpressionV1Schema,
        })
        .strict(),
      z
        .object({
          op: z.literal('if'),
          condition: ExpressionV1Schema,
          [THEN_KEY]: ExpressionV1Schema,
          [ELSE_KEY]: ExpressionV1Schema,
        })
        .strict(),
      z.object({ op: z.literal('coalesce'), values: z.array(ExpressionV1Schema).min(2) }).strict(),
    ])
  )
  .meta({ id: 'ExpressionV1' });

/** The expression versions a `put_field` may store (the server's `EXPRESSION_VERSIONS`). */
export const CatalogueExpressionVersionSchema = z
  .literal([1, 2])
  .describe(
    "How a computed field's expression is evaluated. 1: measurements combine only in one " +
      'fixed unit and decimals compare by spelling (3.0 ≠ 3). 2: measurements of one dimension ' +
      'convert (cm + mm), measurement × and ÷ measurement derive units (cm × cm is cm²), the ' +
      "result converts into the field's fixedUnit, and equal compares decimals by value " +
      '(1.5 × 2 = 3). Required with an expression on a computed field; null on a stored field.'
  );
