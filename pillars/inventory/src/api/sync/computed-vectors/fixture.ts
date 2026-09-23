import type {
  EvaluatedDependency,
  ExpressionUnavailableReason,
} from '../../../catalogue/expression-types.js';
import type { PrimitiveKind, PrimitiveWireValue } from '../../../catalogue/value-types.js';

/** The catalogue revision every vector evaluates against. */
export const VECTOR_CATALOGUE_REVISION = 12;

/** The catalogue revision every vector's override was written against. */
export const VECTOR_OVERRIDE_REVISION = 11;

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
}

/** Item identities, in ascending byte order so dependency sorting is locale-independent. */
export const ITEM = {
  root: uuid(0x101),
  a: uuid(0x102),
  b: uuid(0x103),
  missing: uuid(0x104),
  deleted: uuid(0x105),
  unresolved: uuid(0x106),
  location: uuid(0x107),
} as const;

/** Field identities shared by every vector. */
export const FIELD = {
  computed: uuid(0x201),
  price: uuid(0x202),
  count: uuid(0x203),
  name: uuid(0x205),
  flag: uuid(0x206),
  length: uuid(0x207),
  ref: uuid(0x208),
  upstream: uuid(0x209),
  absent: uuid(0x20c),
} as const;

/** Enum option identities. */
export const OPTION = { red: uuid(0x301), blue: uuid(0x302) } as const;

/** One field an item holds in a vector's snapshot. */
export type VectorField =
  | {
      readonly fieldId: string;
      readonly state: 'value';
      readonly value: PrimitiveWireValue;
      readonly revision: number;
      readonly dependencies?: readonly EvaluatedDependency[];
    }
  | {
      readonly fieldId: string;
      readonly state: 'unavailable';
      readonly reason: ExpressionUnavailableReason;
      readonly failedFieldId: string;
      readonly traversedItemIds: readonly string[];
      readonly revision: number;
      readonly dependencies?: readonly EvaluatedDependency[];
    };

/** How the snapshot answers for one item id; an unlisted id is `missing`. */
export interface VectorItem {
  readonly id: string;
  readonly state: 'resolved' | 'missing' | 'deleted' | 'unresolved';
  readonly revision: number;
  readonly fields: readonly VectorField[];
}

/** The computed field a vector evaluates. */
export interface VectorResultField {
  readonly fieldId: string;
  readonly kind: PrimitiveKind;
  readonly fixedUnit: string | null;
  readonly allowOverride: boolean;
}

/** One hand-written case; the builder records what the server does with it. */
export interface ExpressionVectorCase {
  readonly name: string;
  readonly expressionVersion?: number;
  readonly expression: unknown;
  readonly kind: PrimitiveKind;
  readonly fixedUnit?: string;
  readonly allowOverride?: boolean;
  readonly override?: PrimitiveWireValue;
  readonly items?: readonly VectorItem[];
}

/** A resolved item holding `fields`. */
export function item(id: string, fields: readonly VectorField[] = [], revision = 1): VectorItem {
  return { id, state: 'resolved', revision, fields };
}

/** The root item holding `fields`. */
export function root(...fields: readonly VectorField[]): VectorItem {
  return item(ITEM.root, fields, 3);
}

/** An item the snapshot reports in a non-resolved state. */
export function absentItem(id: string, state: 'missing' | 'deleted' | 'unresolved'): VectorItem {
  return { id, state, revision: 1, fields: [] };
}

/** A stored or evaluated field value. */
export function field(
  fieldId: string,
  value: PrimitiveWireValue,
  revision = 3,
  dependencies?: readonly EvaluatedDependency[]
): VectorField {
  return dependencies === undefined
    ? { fieldId, state: 'value', value, revision }
    : { fieldId, state: 'value', value, revision, dependencies };
}

/** An item reference value. */
export function refTo(
  targetId: string,
  targetKind: 'item' | 'location' = 'item'
): { readonly targetKind: 'item' | 'location'; readonly targetId: string } {
  return { targetKind, targetId };
}

/** One expression node in its wire form. */
export type WireNode = Readonly<Record<string, unknown>>;

/** `{ op: 'literal', value }`. */
export function lit(value: unknown): WireNode {
  return { op: 'literal', value };
}

/** `{ op: 'read', path, fieldId }`. */
export function read(fieldId: string, path: readonly string[] = []): WireNode {
  return { op: 'read', path, fieldId };
}

/** A binary node. */
export function bin(op: string, left: unknown, right: unknown): WireNode {
  return { op, left, right };
}

/** A unary node. */
export function un(op: string, value: unknown): WireNode {
  return { op, value };
}

/**
 * An `if` node. Its wire keys are `then` and `else`, so it is parsed from
 * text, as the parser's own tests do, rather than written as a thenable literal.
 */
export function cond(condition: unknown, whenTrue: unknown, whenFalse: unknown): unknown {
  const node: unknown = JSON.parse(
    `{"op":"if","condition":${JSON.stringify(condition)},"then":${JSON.stringify(whenTrue)},"else":${JSON.stringify(whenFalse)}}`
  );
  return node;
}
