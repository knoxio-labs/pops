import { Input } from '@pops/ui';

import type { ReactElement } from 'react';

import type { FormFieldDef } from './field-model';
import type { DraftAction, ItemDraft } from './form-draft';
import type { ComputedDisplay } from './form-opening';

/** Props for a computed value row and its optional manual override. */
export interface ComputedFieldProps {
  readonly field: FormFieldDef;
  readonly draft: ItemDraft;
  readonly computed: ComputedDisplay | undefined;
  readonly dispatch: (action: DraftAction) => void;
}

/** Renders a computed value, its missing-input state, and an allowed override. */
export function ComputedField({
  field,
  draft,
  computed,
  dispatch,
}: ComputedFieldProps): ReactElement {
  const value = computed?.values.map((entry) => String(entry)).join(', ') ?? 'Not available';
  if (field.allowOverride) {
    return (
      <div className="space-y-2">
        <p className="rounded-md bg-muted px-3 py-2 text-sm">{value}</p>
        <Input
          value={draft.overrides[field.id] ?? ''}
          onChange={(event) =>
            dispatch({ type: 'override', fieldId: field.id, value: event.target.value || null })
          }
          placeholder="Override result"
          aria-label={`${field.label} override`}
        />
      </div>
    );
  }
  if (computed?.state === 'unavailable')
    return (
      <p className="rounded-md bg-muted px-3 py-2 text-sm">
        {computed.reason ?? 'Missing inputs.'}
      </p>
    );
  return <p className="rounded-md bg-muted px-3 py-2 text-sm">{value}</p>;
}
