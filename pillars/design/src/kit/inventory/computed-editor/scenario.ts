import type { ExpressionContext, ExpressionNode, ValueType } from '@pops/app-inventory/design';

/** Server reasons a computed read cannot produce a value (ExpressionUnavailableReason). */
export type UnavailableReason =
  | 'missing_dependency'
  | 'reference_unresolved'
  | 'reference_missing'
  | 'reference_deleted'
  | 'evaluation_error';

/** Raw evaluation failures the preview reports before wire degradation. */
export type EvaluationErrorCode =
  | 'invalid_value'
  | 'integer_overflow'
  | 'precision_overflow'
  | 'division_by_zero';

/** An item the author can preview against. */
export interface PreviewItem {
  readonly id: string;
  readonly label: string;
  readonly typeLabel: string;
}

/** One value read while evaluating, with the revision it was read at. */
export interface PreviewDependency {
  readonly itemLabel: string;
  readonly fieldLabel: string;
  readonly revision: number;
}

interface PreviewEvaluated {
  readonly item: PreviewItem;
  readonly dependencies: readonly PreviewDependency[];
  readonly traversed: readonly PreviewItem[];
  readonly detailsOpen?: boolean;
}

/**
 * The single-item, non-mutating preview of the draft expression, in every
 * state the request can be in.
 */
export type PreviewState =
  | { readonly state: 'no-expression' }
  | { readonly state: 'invalid' }
  | { readonly state: 'no-items'; readonly typeLabel: string }
  | { readonly state: 'loading'; readonly item: PreviewItem }
  | { readonly state: 'request-error'; readonly item: PreviewItem }
  | (PreviewEvaluated & {
      readonly state: 'value';
      readonly value: string;
      readonly workings: string;
      readonly override?: string;
    })
  | (PreviewEvaluated & {
      readonly state: 'unavailable';
      readonly reason: Exclude<UnavailableReason, 'evaluation_error'>;
      readonly missingField: string;
      readonly missingOn: string;
    })
  | (PreviewEvaluated & { readonly state: 'evaluation-error'; readonly code: EvaluationErrorCode });

/** A refusal returned when the draft save is validated, located by issue path. */
export interface ExpressionIssue {
  readonly path: string;
  readonly code: string;
  readonly title: string;
  readonly message: string;
  readonly cycle?: readonly string[];
}

/** Whether the field accepts an explicit value, and what changing that touches. */
export interface OverridePolicy {
  readonly allowOverride: boolean;
  readonly publishedAllowOverride?: boolean;
  readonly itemsWithOverride?: number;
}

/** Where the draft's publication goes from here. */
export type PublishRoute = 'mcp' | 'migration-refused';

/** What the inspector column shows for the selected node. */
export type InspectorPanel = 'node' | 'insert' | 'wrap';

/** Everything one reviewable state of the computed-field editor renders from. */
export interface ComputedScenario {
  readonly context: ExpressionContext;
  readonly field: { readonly label: string; readonly type: ValueType; readonly isNew: boolean };
  readonly expression: ExpressionNode;
  readonly selectedPath: string;
  readonly panel: InspectorPanel;
  readonly policy: OverridePolicy;
  readonly save: 'saved' | 'unsaved' | 'refused';
  readonly issues: readonly ExpressionIssue[];
  readonly preview: PreviewState;
  readonly pickerItems: readonly PreviewItem[];
  readonly publish: PublishRoute;
  readonly followOpen?: boolean;
}
