import { FieldEditor } from '../item-form/field-editor';
import { blankDraft } from '../item-form/form-draft';

import type { ReactElement } from 'react';

import type { PlacementWorld } from '../../foundation/model';
import type { FieldDrafts, FormFieldDef, ReferenceChoice } from '../item-form/field-model';
import type { DraftAction } from '../item-form/form-draft';

/** Props for the stored catalogue-field editor embedded in a fact row. */
export interface StoredFieldEditorProps {
  field: FormFieldDef;
  drafts: FieldDrafts;
  error?: string;
  world: PlacementWorld;
  typeLabel: (typeId: string) => string;
  onText: (values: readonly string[]) => void;
  onRefs: (refs: readonly ReferenceChoice[]) => void;
  onBoolean: (value: boolean) => void;
}

/** Adapts the item-form field controls to one inline stored fact. */
export function StoredFieldEditor({
  field,
  drafts,
  error,
  onText,
  onRefs,
  onBoolean,
}: StoredFieldEditorProps): ReactElement {
  const draft = { ...blankDraft(), fields: drafts };
  const dispatch = (action: DraftAction): void => {
    if (action.type === 'field-text' && action.fieldId === field.id) {
      onText(action.values);
      return;
    }
    if (action.type === 'field-refs' && action.fieldId === field.id) {
      onRefs(action.refs);
      return;
    }
    if (action.type === 'field-boolean' && action.fieldId === field.id) onBoolean(action.value);
  };

  return (
    <div className="mt-1 space-y-2">
      <FieldEditor
        field={field}
        draft={draft}
        computed={undefined}
        dispatch={dispatch}
        onReferenceQuery={() => undefined}
      />
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <p className="text-2xs text-muted-foreground">Enter to save · Esc to cancel</p>
    </div>
  );
}
