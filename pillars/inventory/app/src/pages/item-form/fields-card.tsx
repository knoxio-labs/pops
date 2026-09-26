import { Card, CardContent, CardHeader, CardTitle, Label, Textarea } from '@pops/ui';

import { FieldEditor } from './field-editor';

import type { ReactElement } from 'react';

import type { DraftAction, ItemDraft } from './form-draft';
import type { ComputedDisplay } from './form-opening';
import type { FormView } from './form-view';

/** Props for the type-specific and computed field card. */
export interface FieldsCardProps {
  readonly draft: ItemDraft;
  readonly view: FormView;
  readonly computed: Readonly<Record<string, ComputedDisplay>>;
  readonly dispatch: (action: DraftAction) => void;
  readonly onReferenceQuery: (query: string) => void;
}

/** Renders the selected type's fields and communicates type-change leftovers. */
export function FieldsCard({
  draft,
  view,
  computed,
  dispatch,
  onReferenceQuery,
}: FieldsCardProps): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fields</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {view.type === null ? (
          <p className="rounded-md bg-muted px-3 py-3 text-sm text-muted-foreground">
            Without a type, this item keeps its name, code, quantity, place and note. You can add a
            type later.
          </p>
        ) : null}
        {view.notCarried.length > 0 ? (
          <div
            role="status"
            className="rounded-md border border-warning/40 bg-warning/10 px-3 py-3 text-sm"
          >
            Changing type leaves{' '}
            {view.notCarried.map((field) => `${field.label} (${field.count})`).join(', ')} behind.
          </div>
        ) : null}
        {view.type?.fields.map((field) => (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={`field-${field.id}`}>{field.label}</Label>
            {field.help ? <p className="text-xs text-muted-foreground">{field.help}</p> : null}
            <FieldEditor
              field={field}
              draft={draft}
              computed={computed[field.id]}
              dispatch={dispatch}
              onReferenceQuery={onReferenceQuery}
            />
            {view.fieldErrors[field.id] ? (
              <p className="text-sm text-destructive">{view.fieldErrors[field.id]}</p>
            ) : null}
          </div>
        ))}
        <div className="space-y-2 border-t pt-5">
          <Label htmlFor="item-note">Note</Label>
          <Textarea
            id="item-note"
            value={draft.note}
            rows={2}
            placeholder="Anything the fields do not cover"
            onChange={(event) => dispatch({ type: 'note', value: event.target.value })}
          />
        </div>
      </CardContent>
    </Card>
  );
}
