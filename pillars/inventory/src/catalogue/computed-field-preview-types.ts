import type { EvaluatedDependency, ExpressionUnavailableReason } from './expression-types.js';
import type { PrimitiveWireValue } from './value-types.js';

/** The computed field and item a draft preview evaluates. */
export interface ComputedFieldPreviewSubject {
  readonly typeId: string;
  readonly field: { readonly id: string } | { readonly key: string };
  readonly itemId: string;
}

/** An input the preview could not read, the item it was read on, and why. */
export interface ComputedFieldPreviewMissing {
  readonly fieldId: string;
  readonly itemId: string;
  readonly reason: ExpressionUnavailableReason;
}

/** The raw outcome of evaluating the draft expression on the chosen item. */
export type ComputedFieldPreviewResult =
  | {
      readonly state: 'value';
      readonly value: PrimitiveWireValue;
      readonly dependencies: readonly EvaluatedDependency[];
      readonly traversedItemIds: readonly string[];
    }
  | {
      readonly state: 'unavailable';
      /** Every input the calculation could not read; `coalesce` reports one per argument. */
      readonly missingInputs: readonly ComputedFieldPreviewMissing[];
      readonly dependencies: readonly EvaluatedDependency[];
      readonly traversedItemIds: readonly string[];
    }
  | {
      readonly state: 'error';
      readonly code:
        | 'invalid_value'
        | 'integer_overflow'
        | 'precision_overflow'
        | 'division_by_zero';
      readonly dependencies: readonly EvaluatedDependency[];
      readonly traversedItemIds: readonly string[];
    };

/** An item the preview names, so a client can label it without another read. */
export interface ComputedFieldPreviewItem {
  readonly id: string;
  readonly name: string;
  readonly typeId: string | null;
}

/** Everything a non-mutating computed-field preview answers. */
export interface ComputedFieldPreview {
  readonly baseRevision: number;
  readonly draftRevision: number;
  readonly draftVersion: number;
  readonly typeId: string;
  readonly fieldId: string;
  readonly itemId: string;
  readonly result: ComputedFieldPreviewResult;
  readonly override: PrimitiveWireValue | null;
  readonly items: readonly ComputedFieldPreviewItem[];
}
