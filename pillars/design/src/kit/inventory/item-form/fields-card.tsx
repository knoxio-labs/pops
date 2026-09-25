/**
 * The chosen type's fields, as the one list on the page that scrolls. With
 * no type it says what an untyped item keeps; after a type change it names
 * the typed values the new type has no field for, before Save drops them.
 */
import { Card } from '@pops/ui';

import { FieldRow } from '../field-editors/field-row';
import { INVENTORY_ICONS } from '../shared/icons';
import { NoteField } from './identity-fields';

import type { ComputedDisplay } from '../field-editors/computed-row';
import type { FormTypeDef } from '../field-editors/field-model';
import type { ItemDraft, DraftAction } from './form-draft';
import type { FormOverlay, ItemFormContext } from './form-opening';
import type { FormView, NotCarried } from './form-view';

function NoType() {
  const Shapes = INVENTORY_ICONS.type;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-lg bg-muted">
        <Shapes className="size-5 text-muted-foreground" aria-hidden />
      </span>
      <p className="text-sm font-medium">No type yet</p>
      <p className="max-w-xs text-sm text-muted-foreground">
        A type adds its own fields here. Without one, the item keeps its name, code, quantity,
        place, note and photos, and can be typed later.
      </p>
    </div>
  );
}

function listNames(entries: readonly NotCarried[]): string {
  const names = entries.map((entry) => entry.label);
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
}

function NotCarriedNotice({ entries, type }: { entries: readonly NotCarried[]; type: string }) {
  const Warn = INVENTORY_ICONS.needsAttention;
  return (
    <div
      role="status"
      className="mx-4 mt-3 flex gap-2.5 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2"
    >
      <Warn className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <p className="text-sm">
        <span className="font-medium">Not carried over: {listNames(entries)}.</span>{' '}
        <span className="text-muted-foreground">
          {type} has no field for {entries.length === 1 ? 'it' : 'them'}, so saving leaves{' '}
          {entries.length === 1 ? 'it' : 'them'} out. Switch the type back to keep{' '}
          {entries.length === 1 ? 'it' : 'them'}.
        </span>
      </p>
    </div>
  );
}

/** Props for {@link FieldsCard}. */
export interface FieldsCardProps {
  draft: ItemDraft;
  view: FormView;
  context: ItemFormContext;
  computed: Readonly<Record<string, ComputedDisplay>>;
  dispatch: (action: DraftAction) => void;
  overlay?: FormOverlay;
}

function Header({ type }: { type: FormTypeDef }) {
  const computed = type.fields.filter((field) => field.computed !== undefined).length;
  return (
    <header className="flex items-baseline justify-between gap-2 border-b px-5 py-3">
      <h2 className="text-sm font-semibold">{type.label} fields</h2>
      <p className="text-xs text-muted-foreground">
        {type.fields.length} {type.fields.length === 1 ? 'field' : 'fields'}
        {computed > 0 ? `, ${computed} calculated` : ''}. All optional.
      </p>
    </header>
  );
}

/** The right-hand card. */
export function FieldsCard({ draft, view, context, computed, dispatch, overlay }: FieldsCardProps) {
  const { type } = view;
  return (
    <Card className="flex min-h-0 flex-col gap-0 overflow-hidden py-0">
      {type === null ? null : <Header type={type} />}
      {view.notCarried.length > 0 ? (
        <NotCarriedNotice entries={view.notCarried} type={type?.label ?? 'No type'} />
      ) : null}
      {type === null || type.fields.length === 0 ? (
        <div className="min-h-0 flex-1">{type === null ? <NoType /> : null}</div>
      ) : (
        <div className="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto px-5 py-1">
          {type.fields.map((field) => (
            <FieldRow
              key={field.id}
              field={field}
              drafts={draft.fields}
              error={view.fieldErrors[field.id]}
              world={context.world}
              typeLabel={context.typeLabel}
              computed={computed[field.id]}
              override={draft.overrides[field.id]}
              onText={(values) => dispatch({ type: 'field-text', fieldId: field.id, values })}
              onRefs={(refs) => dispatch({ type: 'field-refs', fieldId: field.id, refs })}
              onOverride={(value) => dispatch({ type: 'override', fieldId: field.id, value })}
              pickerOpen={overlay?.kind === 'reference' && overlay.fieldId === field.id}
              pickerQuery={overlay?.kind === 'reference' ? overlay.query : undefined}
            />
          ))}
        </div>
      )}
      <NoteField value={draft.note} onChange={(value) => dispatch({ type: 'note', value })} />
    </Card>
  );
}
