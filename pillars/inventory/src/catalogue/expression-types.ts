import type { PrimitiveKind, PrimitiveWireValue } from './value-types.js';

/** The only expression syntax understood by protocol-2 catalogue clients. */
export type ExpressionV1 =
  | { readonly op: 'literal'; readonly value: PrimitiveWireValue }
  | { readonly op: 'read'; readonly path: readonly string[]; readonly fieldId: string }
  | { readonly op: 'negate' | 'not'; readonly value: ExpressionV1 }
  | {
      readonly op:
        | 'add'
        | 'subtract'
        | 'multiply'
        | 'divide'
        | 'concat'
        | 'equal'
        | 'less_than'
        | 'and'
        | 'or';
      readonly left: ExpressionV1;
      readonly right: ExpressionV1;
    }
  | {
      readonly op: 'if';
      readonly condition: ExpressionV1;
      readonly thenBranch: ExpressionV1;
      readonly elseBranch: ExpressionV1;
    }
  | { readonly op: 'coalesce'; readonly values: readonly ExpressionV1[] };

/** A primitive type inferred for a validated expression node. */
export interface ExpressionValueType {
  readonly kind: PrimitiveKind;
  readonly fixedUnit: string | null;
}

/** A catalogue field addressed by stable type and field identities. */
export interface ExpressionFieldKey {
  readonly typeId: string;
  readonly fieldId: string;
}

/** One static dependency declared by a validated expression. */
export interface ExpressionDependency extends ExpressionFieldKey {
  readonly via: readonly string[];
}

/** A parsed and type-checked computed-field expression. */
export interface ValidatedExpression {
  readonly ast: ExpressionV1;
  /** The stored expression version; 2 and later derive and convert measurement units. */
  readonly version: number;
  readonly dependencies: readonly ExpressionDependency[];
  readonly field: ExpressionFieldKey;
  /** The computed field's declared type, which the result is converted into and checked against. */
  readonly resultType: ExpressionValueType;
  /** Every catalogue field's declared kind by id, which types a version-2 `equal` on a read. */
  readonly fieldKinds: ReadonlyMap<string, PrimitiveKind>;
}

/** Stable runtime identity and revision of one value read during evaluation. */
export interface EvaluatedDependency {
  readonly itemId: string;
  readonly fieldId: string;
  readonly revision: number;
}

/** Why a computed read cannot currently produce a value. */
export type ExpressionUnavailableReason =
  | 'missing_dependency'
  | 'reference_unresolved'
  | 'reference_missing'
  | 'reference_deleted'
  | 'evaluation_error';

/**
 * One input an unavailable evaluation lacked: the field that had no value, the
 * item the read had reached, and why. `coalesce` reports one per argument.
 */
export interface ExpressionMissingInput {
  readonly reason: ExpressionUnavailableReason;
  readonly fieldId: string;
  readonly itemId: string;
}

/** A snapshot field supplied synchronously to the deterministic evaluator. */
export type SnapshotFieldValue =
  | {
      readonly state: 'value';
      readonly value: PrimitiveWireValue;
      readonly revision: number;
      readonly dependencies?: readonly EvaluatedDependency[];
    }
  | {
      readonly state: 'unavailable';
      readonly reason: ExpressionUnavailableReason;
      readonly fieldId: string;
      readonly traversedItemIds: readonly string[];
      readonly revision: number;
      readonly dependencies?: readonly EvaluatedDependency[];
      /** Every input the field's own evaluation lacked; absent or empty means only `fieldId`. */
      readonly missingInputs?: readonly ExpressionMissingInput[];
    };

/** A snapshot item supplied synchronously to the deterministic evaluator. */
export interface ExpressionSnapshotItem {
  readonly id: string;
  readonly revision: number;
  readonly fields: ReadonlyMap<string, SnapshotFieldValue>;
}

/** Closed, synchronous item lookup used during one evaluation snapshot. */
export interface ExpressionSnapshot {
  readonly rootItemId: string;
  readonly readItem: (
    itemId: string
  ) =>
    | { readonly state: 'resolved'; readonly item: ExpressionSnapshotItem }
    | { readonly state: 'unresolved' | 'missing' | 'deleted' };
  readonly readField: (itemId: string, fieldId: string) => SnapshotFieldValue | undefined;
}

/** Raw deterministic expression outcome before wire-level error degradation. */
export type ExpressionEvaluation =
  | {
      readonly state: 'value';
      readonly value: PrimitiveWireValue;
      readonly dependencies: readonly EvaluatedDependency[];
    }
  | {
      readonly state: 'unavailable';
      readonly reason: ExpressionUnavailableReason;
      readonly fieldId: string;
      readonly traversedItemIds: readonly string[];
      readonly missingInputs: readonly ExpressionMissingInput[];
      readonly dependencies: readonly EvaluatedDependency[];
    }
  | {
      readonly state: 'error';
      readonly code:
        | 'invalid_value'
        | 'integer_overflow'
        | 'precision_overflow'
        | 'division_by_zero';
      readonly dependencies: readonly EvaluatedDependency[];
    };

/** Effective computed value with explicit computed or override provenance. */
export type EffectiveComputedValue =
  | {
      readonly state: 'value';
      readonly values: readonly [PrimitiveWireValue];
      readonly provenance:
        | {
            readonly source: 'computed';
            readonly catalogueRevision: number;
            readonly dependencies: readonly EvaluatedDependency[];
          }
        | { readonly source: 'override'; readonly catalogueRevision: number };
    }
  | {
      readonly state: 'unavailable';
      readonly reason: ExpressionUnavailableReason;
      readonly fieldId: string;
      readonly traversedItemIds: readonly string[];
      /** Every input without a value; empty when the expression itself failed. */
      readonly missingInputs: readonly ExpressionMissingInput[];
      readonly provenance: {
        readonly source: 'computed';
        readonly catalogueRevision: number;
        readonly dependencies: readonly EvaluatedDependency[];
      };
    };

/** A structural expression failure annotated with its machine-readable location. */
export class ExpressionValidationError extends Error {
  constructor(
    public readonly code: string,
    public readonly path: string,
    message: string,
    public readonly definitionId: string | null = null
  ) {
    super(`${path}: ${message}`);
    this.name = 'ExpressionValidationError';
  }
}
