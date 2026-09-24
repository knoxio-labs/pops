import { useMemo } from 'react';

import { formula } from '../expression/formula';
import { expressionContext, fieldValueType, toWire } from '../expression/wire';
import { useFieldFormContext } from '../FieldFormContext';
import { useComputedSection } from './computed-environment';
import { ComputedFieldEditor } from './ComputedFieldEditor';
import { expressionIssues } from './issues';
import { previewStateFrom } from './preview-model';
import { ResultPreview } from './ResultPreview';
import { useComputedPreview } from './useComputedPreview';

import type { InventoryApiIssue } from '../../inventory-api-helpers';
import type { ExpressionContext, ExpressionField } from '../expression/model';
import type { CatalogueOperation } from '../types';
import type { ComputedFieldEnvironment } from './computed-environment';
import type { ExpressionIssue } from './issues';
import type { PreviewItem, PreviewState } from './preview-model';
import type { PreviewOutcome } from './useComputedPreview';

interface PreviewInputs {
  readonly complete: boolean;
  readonly environment: ComputedFieldEnvironment;
  readonly issues: readonly ExpressionIssue[];
  readonly items: readonly PreviewItem[];
  readonly itemsLoading: boolean;
  readonly itemId: string | null;
  readonly outcome: PreviewOutcome;
  readonly typeLabel: string;
  readonly render: (
    response: Extract<PreviewOutcome, { kind: 'answered' }>['response']
  ) => PreviewState;
}

function waitingState(inputs: PreviewInputs): PreviewState | null {
  if (!inputs.complete) return { state: 'no-expression' };
  if (inputs.environment.draft === null && inputs.environment.publishedRevision === undefined)
    return { state: 'no-draft' };
  if (!inputs.itemsLoading && inputs.items.length === 0)
    return { state: 'no-items', typeLabel: inputs.typeLabel };
  if (inputs.issues.length > 0) return { state: 'invalid' };
  return null;
}

function previewState(inputs: PreviewInputs): PreviewState {
  const waiting = waitingState(inputs);
  if (waiting !== null) return waiting;
  const item = inputs.items.find((candidate) => candidate.id === inputs.itemId);
  if (item === undefined) return { state: 'idle' };
  switch (inputs.outcome.kind) {
    case 'loading':
      return { state: 'loading', item };
    case 'failed':
      return { state: 'request-error', item };
    case 'invalid':
      return { state: 'invalid' };
    case 'answered':
      return inputs.render(inputs.outcome.response);
    default:
      return { state: 'idle' };
  }
}

function useOwnField(): ExpressionField {
  const form = useFieldFormContext();
  return {
    id: form.field?.id ?? '',
    label: form.label.trim() === '' ? 'This field' : form.label.trim(),
    kind: form.kind,
    cardinality: 'one',
    storage: 'computed',
    options: (form.field?.enumOptions ?? []).map((option) => ({
      id: option.id,
      label: option.label,
    })),
  };
}

function migrationFor(
  environment: ComputedFieldEnvironment,
  fieldId: string | undefined
): { readonly draftRevision: number | null } | null {
  const compatibility = environment.compatibility;
  if (compatibility?.classification !== 'migration_required' || fieldId === undefined) return null;
  const concerns = compatibility.changes.some(
    (change) => change.classification === 'migration_required' && change.definitionId === fieldId
  );
  return concerns ? { draftRevision: environment.draft?.revision.revision ?? null } : null;
}

function opTargetsField(
  operation: CatalogueOperation,
  field: { readonly id: string | undefined; readonly key: string }
): boolean {
  if (operation.kind !== 'put_field') return false;
  if (field.id !== undefined && operation.id !== undefined) return operation.id === field.id;
  return operation.key === field.key;
}

/**
 * The live count of items holding an override on this field, from the latest
 * compatibility evidence — but only when that evidence was computed for the
 * override state as it stands right now. Evidence computed for a different
 * toggle position (an older preview, a recheck of the persisted draft while
 * an unsaved toggle is in progress, or evidence about a different field) is
 * not this field's answer and is reported as unknown rather than shown.
 */
function itemsWithOverride(
  environment: ComputedFieldEnvironment,
  field: { readonly id: string | undefined; readonly key: string },
  currentAllowOverride: boolean
): number | undefined {
  if (field.id === undefined && field.key === '') return undefined;
  const current = environment.compatibilityOperations.find((op) => opTargetsField(op, field));
  if (current === undefined || current.kind !== 'put_field') return undefined;
  if ((current.allowOverride ?? true) !== currentAllowOverride) return undefined;
  const fieldId = field.id ?? current.id;
  if (fieldId === undefined) return undefined;
  return (
    environment.compatibility?.discardedOverrides.find((entry) => entry.fieldId === fieldId)
      ?.items ?? 0
  );
}

function overridePolicy(
  environment: ComputedFieldEnvironment,
  form: {
    readonly field?: { readonly id: string };
    readonly keyValue: string;
    readonly allowOverride: boolean;
  }
) {
  return {
    allowOverride: form.allowOverride,
    publishedAllowOverride: environment.publishedField?.allowOverride,
    publishedRevision: environment.publishedRevision,
    itemsWithOverride: itemsWithOverride(
      environment,
      { id: form.field?.id, key: form.keyValue },
      form.allowOverride
    ),
  };
}

function activeIssues(
  saveRefused: boolean,
  environment: ComputedFieldEnvironment,
  outcome: PreviewOutcome
): readonly InventoryApiIssue[] {
  if (saveRefused) return environment.saveIssues;
  if (outcome.kind === 'invalid') return outcome.issues;
  return environment.liveIssues;
}

function useContextFor(): ExpressionContext {
  const form = useFieldFormContext();
  const { type } = useComputedSection();
  const fieldId = form.field?.id;
  return useMemo(
    () => expressionContext(form.types, type.id, fieldId),
    [form.types, type.id, fieldId]
  );
}

/**
 * The field form's computed section: the approved computed-field editor wired
 * to the form's expression and override policy, to the server's issues for
 * this edit, and to the "Try on an item" preview route.
 */
export function ComputedFieldSection() {
  const form = useFieldFormContext();
  const { environment, type, operation, submitted } = useComputedSection();
  const context = useContextFor();
  const ownField = useOwnField();
  const complete = toWire(form.expression) !== null;
  const preview = useComputedPreview({
    draft: environment.draft,
    publishedRevision: environment.publishedRevision ?? null,
    type: { id: type.id, key: type.key, label: type.label },
    field: form.field === undefined ? { key: form.keyValue } : { id: form.field.id },
    operation: complete ? operation : null,
  });
  const operationKey = operation === null ? null : JSON.stringify(operation);
  const saveRefused = environment.saveIssues.length > 0 && submitted === operationKey;
  const issues = expressionIssues(
    activeIssues(saveRefused, environment, preview.outcome),
    { id: form.field?.id, label: ownField.label },
    context
  );
  const state = previewState({
    complete,
    environment,
    issues,
    items: preview.items,
    itemsLoading: preview.itemsLoading,
    itemId: preview.itemId,
    outcome: preview.outcome,
    typeLabel: type.label,
    render: (response) =>
      previewStateFrom(response, context, ownField, formula(context, form.expression)),
  });
  return (
    <ComputedFieldEditor
      context={context}
      fieldType={fieldValueType(form.kind, form.fixedUnit)}
      storedExpressionVersion={form.field?.expressionVersion}
      expression={form.expression}
      onExpressionChange={form.setExpression}
      issues={issues}
      policy={overridePolicy(environment, form)}
      onPolicyChange={form.setAllowOverride}
      saveRefused={saveRefused}
      migration={migrationFor(environment, form.field?.id)}
      preview={
        <ResultPreview
          preview={state}
          items={preview.items}
          itemId={preview.itemId}
          onPick={preview.pick}
          onRetry={preview.retry}
        />
      }
    />
  );
}
