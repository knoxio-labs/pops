import { Input } from '@pops/ui';

import { formatComputedValueResult } from './computed-value';

import type { ReactElement } from 'react';

import type { FormattedComputedValue } from './computed-value';
import type { FormFieldDef } from './field-model';
import type { DraftAction, ItemDraft } from './form-draft';
import type { ComputedDisplay } from './form-opening';

/** Props for a computed value row and its optional manual override. */
export interface ComputedFieldProps {
  readonly field: FormFieldDef;
  readonly draft: ItemDraft;
  readonly computed: ComputedDisplay | undefined;
  readonly error?: string;
  readonly dispatch: (action: DraftAction) => void;
}

function inputType(field: FormFieldDef): 'text' | 'number' | 'date' | 'datetime-local' | 'url' {
  if (field.kind === 'integer' || field.kind === 'decimal' || field.kind === 'measurement') {
    return 'number';
  }
  if (field.kind === 'date') return 'date';
  if (field.kind === 'date_time') return 'datetime-local';
  if (field.kind === 'url') return 'url';
  return 'text';
}

function displayText(
  field: FormFieldDef,
  computed: ComputedDisplay | undefined
): FormattedComputedValue {
  if (computed === undefined) return { text: 'Will calculate after saving.', valid: true };
  if (computed.state === 'unavailable') {
    return { text: computed.reason ?? 'Missing inputs.', valid: true };
  }
  if (computed.values.length === 0) return { text: 'No value.', valid: true };
  const formatted = computed.values.map((value) => formatComputedValueResult(field, value));
  return {
    text: formatted.map((value) => value.text).join(', '),
    valid: formatted.every((value) => value.valid),
  };
}

/** Renders a computed value, its missing-input state, and an allowed override. */
export function ComputedField({
  field,
  draft,
  computed,
  error,
  dispatch,
}: ComputedFieldProps): ReactElement {
  const display = displayText(field, computed);
  const status = computed === undefined ? 'pending' : computed.state;
  return (
    <div className="space-y-2">
      <p
        role="status"
        className="rounded-md bg-muted px-3 py-2 text-sm"
        aria-invalid={!display.valid}
      >
        {display.text}
      </p>
      {status === 'overridden' ? (
        <p className="text-xs text-muted-foreground">Using the saved manual override.</p>
      ) : null}
      {field.allowOverride ? (
        <div className="flex items-start gap-2">
          <Input
            id={`field-${field.id}`}
            type={inputType(field)}
            value={draft.overrides[field.id] ?? ''}
            onChange={(event) =>
              dispatch({ type: 'override', fieldId: field.id, value: event.target.value || null })
            }
            placeholder="Override result"
            aria-label={`${field.label} override`}
            aria-invalid={error !== undefined}
            aria-describedby={error === undefined ? undefined : `field-error-${field.id}`}
          />
          {field.kind === 'measurement' && field.fixedUnit !== null ? (
            <span className="pt-2 text-sm text-muted-foreground">{field.fixedUnit}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
