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

/** The type a field holds or a node returns, with a measurement's fixed unit. */
export interface ValueType {
  readonly kind: ValueKind;
  readonly unit?: string;
}

/**
 * What a slot accepts. Beside an exact value type, a factor of a product or
 * quotient takes any number in any unit, because measurement × measurement
 * yields a derived unit (cm × cm = cm²) that only the server resolves.
 */
export type SlotType = ValueType | { readonly kind: 'number' };

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
  | { readonly optionId: string }
  | { readonly targetKind: 'item' | 'location'; readonly targetId: string };

/**
 * Expression v1 with `coalesce`, plus the editor-only `empty` slot a draft
 * holds while it is being built. `empty` never reaches the server: saving is
 * refused while one remains. `if` names its branches `thenBranch` and
 * `elseBranch` here; the wire and the issue paths call them `then` and `else`.
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
  | { readonly op: 'coalesce'; readonly values: readonly ExpressionNode[] };

/** Every operation the builder can place, including the empty slot. */
export type NodeOp = ExpressionNode['op'];

/** A read node. */
export type ReadNode = Extract<ExpressionNode, { op: 'read' }>;

/** A catalogue field as the expression builder needs to see it. */
export interface ExpressionField {
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
  /** Archived fields still label an expression that reads them, but are not offered. */
  readonly archived?: boolean;
}

/** A catalogue type whose fields a read can reach. */
export interface ExpressionType {
  readonly id: string;
  readonly label: string;
  readonly fields: readonly ExpressionField[];
}

/** Everything the builder reads to label and slot-type one expression. */
export interface ExpressionContext {
  readonly types: readonly ExpressionType[];
  readonly ownerTypeId: string;
}

/** Hard bounds enforced by the server parser and validator. */
export const EXPRESSION_LIMITS = { nodes: 128, dependencies: 32, hops: 2 } as const;

const KIND_LABELS: Record<ValueKind | 'number', string> = {
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
  number: 'Number',
};

/** Human label for a slot or value type, naming a measurement's fixed unit. */
export function valueTypeLabel(type: SlotType): string {
  const base = KIND_LABELS[type.kind];
  return 'unit' in type && type.unit !== undefined ? `${base} in ${type.unit}` : base;
}

/** Whether a kind takes part in arithmetic and ordering. */
export function isNumericKind(kind: ValueKind | 'number'): boolean {
  return kind === 'integer' || kind === 'decimal' || kind === 'measurement' || kind === 'number';
}

/** Whether a kind can be joined as text. */
export function isTextKind(kind: ValueKind | 'number'): boolean {
  return kind === 'short_text' || kind === 'long_text';
}
