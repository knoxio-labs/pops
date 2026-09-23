/** Primitive kinds a computed expression can produce or read. */
export type ValueKind =
  | 'short_text'
  | 'long_text'
  | 'integer'
  | 'decimal'
  | 'boolean'
  | 'enum'
  | 'measurement'
  | 'date'
  | 'date_time'
  | 'url'
  | 'reference';

/** The type an expression slot expects or a node returns, with its fixed unit. */
export interface ValueType {
  readonly kind: ValueKind;
  readonly unit?: string;
}

/** Two-input operations in expression v1. */
export type BinaryOp =
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'concat'
  | 'equal'
  | 'less_than'
  | 'and'
  | 'or';

/** A canonical literal as the expression wire carries it. */
export type LiteralValue =
  | string
  | number
  | boolean
  | { readonly amount: string; readonly unit: string }
  | { readonly optionId: string };

/**
 * Expression v1 plus the approved `coalesce` node, and the editor-only `empty`
 * slot a draft holds while it is being built. `empty` never reaches the draft:
 * saving is refused while one remains.
 */
export type ExpressionNode =
  | { readonly op: 'empty' }
  | { readonly op: 'literal'; readonly value: LiteralValue }
  | { readonly op: 'read'; readonly path: readonly string[]; readonly fieldId: string }
  | { readonly op: 'negate' | 'not'; readonly value: ExpressionNode }
  | { readonly op: BinaryOp; readonly left: ExpressionNode; readonly right: ExpressionNode }
  | {
      readonly op: 'if';
      readonly condition: ExpressionNode;
      readonly thenBranch: ExpressionNode;
      readonly elseBranch: ExpressionNode;
    }
  | { readonly op: 'coalesce'; readonly args: readonly ExpressionNode[] };

/** Every operation the builder can place, including the empty slot. */
export type NodeOp = ExpressionNode['op'];

/** A catalogue field as the expression builder needs to see it. */
export interface DesignField {
  readonly id: string;
  readonly label: string;
  readonly kind: ValueKind;
  readonly unit?: string;
  readonly cardinality: 'one' | 'many';
  readonly storage: 'stored' | 'computed';
  readonly reference?: {
    readonly kinds: readonly ('item' | 'location')[];
    readonly typeIds: readonly string[];
  };
  readonly options?: readonly { readonly id: string; readonly label: string }[];
}

/** A catalogue type whose fields a read can reach. */
export interface DesignType {
  readonly id: string;
  readonly label: string;
  readonly fields: readonly DesignField[];
}

/** Everything the builder reads to label and type-check one expression. */
export interface ExpressionContext {
  readonly types: readonly DesignType[];
  readonly ownerTypeId: string;
}

/** Hard bounds enforced by the server parser and validator. */
export const EXPRESSION_LIMITS = { nodes: 128, dependencies: 32, hops: 2 } as const;

const KIND_LABELS: Record<ValueKind, string> = {
  short_text: 'Short text',
  long_text: 'Long text',
  integer: 'Integer',
  decimal: 'Decimal',
  boolean: 'Yes or no',
  enum: 'Choice',
  measurement: 'Measurement',
  date: 'Date',
  date_time: 'Date and time',
  url: 'Link',
  reference: 'Reference',
};

/** Human label for a value type, naming a measurement's fixed unit. */
export function valueTypeLabel(type: ValueType): string {
  const base = KIND_LABELS[type.kind];
  return type.unit === undefined ? base : `${base} in ${type.unit}`;
}

/** Whether a kind takes part in arithmetic and ordering. */
export function isNumericKind(kind: ValueKind): boolean {
  return kind === 'integer' || kind === 'decimal' || kind === 'measurement';
}

/** Whether a kind can be joined as text. */
export function isTextKind(kind: ValueKind): boolean {
  return kind === 'short_text' || kind === 'long_text';
}
