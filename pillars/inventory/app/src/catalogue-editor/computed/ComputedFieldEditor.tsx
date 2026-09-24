import { savedExpressionVersion } from '../expression/expression-version';
import { ExpressionBuilderProvider } from './BuilderContext';
import { ExpressionVersionUpgrade, McpPublishRoute, SaveRefused } from './EditorNotices';
import { ExpressionPanel } from './ExpressionPanel';
import { NodeInspector } from './NodeInspector';
import { OverridePolicyControl } from './OverridePolicyControl';

import type { ReactNode } from 'react';

import type { ExpressionContext, ExpressionNode, ValueType } from '@pops/inventory/expression';

import type { ExpressionIssue } from './issues';
import type { OverridePolicy } from './OverridePolicyControl';

/** Props of {@link ComputedFieldEditor}; it takes its whole world through them. */
export interface ComputedFieldEditorProps {
  readonly context: ExpressionContext;
  readonly fieldType: ValueType;
  readonly expression: ExpressionNode;
  readonly onExpressionChange: (next: ExpressionNode) => void;
  readonly issues: readonly ExpressionIssue[];
  readonly policy: OverridePolicy;
  readonly onPolicyChange: (allowOverride: boolean) => void;
  /** True while the last save of this exact edit was refused. */
  readonly saveRefused: boolean;
  /** Set when the draft's compatibility check classifies this field's change as a migration. */
  readonly migration: { readonly draftRevision: number | null } | null;
  /** The saved field's expression version; absent for a field not saved yet. */
  readonly storedExpressionVersion?: number | null;
  /** The "Try on an item" panel, wired to the preview route by the caller. */
  readonly preview: ReactNode;
}

function upgradesVersion(props: ComputedFieldEditorProps): boolean {
  return (
    props.storedExpressionVersion === 1 &&
    savedExpressionVersion(1, props.context, props.expression, props.fieldType) !== 1
  );
}

/**
 * The web catalogue editor's computed-field authoring surface, embedded in the
 * field form: build or edit the expression as an outline plus an inspector,
 * set the override policy, and try the unsaved edit on one item. Saving is
 * the field form's; whether the tree types is the server's answer, placed on
 * the node its issue path names.
 */
export function ComputedFieldEditor(props: ComputedFieldEditorProps) {
  return (
    <ExpressionBuilderProvider
      context={props.context}
      fieldType={props.fieldType}
      expression={props.expression}
      issues={props.issues}
      onExpressionChange={props.onExpressionChange}
    >
      <section className="space-y-4" aria-label="Computation">
        {props.saveRefused && props.issues.length > 0 && <SaveRefused issues={props.issues} />}
        {props.migration !== null && (
          <McpPublishRoute draftRevision={props.migration.draftRevision} />
        )}
        {upgradesVersion(props) && <ExpressionVersionUpgrade />}
        <OverridePolicyControl policy={props.policy} onChange={props.onPolicyChange} />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <ExpressionPanel />
          <NodeInspector />
        </div>
        {props.preview}
      </section>
    </ExpressionBuilderProvider>
  );
}
