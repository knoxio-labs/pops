/**
 * One field of the chosen type as a form row: its label on the left (with
 * the calculated mark for a computed field), the kind's editor on the
 * right, and the value-rule problem under the editor when there is one.
 */
import { Label } from '@pops/ui';

import { INVENTORY_ICONS } from '../shared/icons';
import { ComputedValue } from './computed-row';
import { EnumPills, EnumSelect } from './enum-editors';
import { allowsMany } from './field-model';
import { FieldProblem } from './field-note';
import { LongTextList } from './long-text-list';
import { OneValueEditor } from './one-editors';
import { ReferenceEditor } from './reference-editor';
import { ValueChips } from './value-chips';

import type { PlacementWorld } from '../shared/placement-model';
import type { ComputedDisplay } from './computed-row';
import type { FieldDrafts, FormFieldDef, ReferenceChoice } from './field-model';

/** Props for {@link FieldRow}. */
export interface FieldRowProps {
  field: FormFieldDef;
  drafts: FieldDrafts;
  error?: string;
  world: PlacementWorld;
  typeLabel: (typeId: string) => string;
  computed?: ComputedDisplay;
  override?: string;
  onText: (values: readonly string[]) => void;
  onRefs: (refs: readonly ReferenceChoice[]) => void;
  onOverride: (value: string | null) => void;
  /** Review states only: open this row's reference picker on load. */
  pickerOpen?: boolean;
  pickerQuery?: string;
}

function StoredEditor(props: FieldRowProps & { describedBy?: string }) {
  const { field, drafts, onText } = props;
  const values = drafts.text[field.id] ?? [];
  const invalid = props.error !== undefined;
  if (field.kind === 'reference') {
    return (
      <ReferenceEditor
        field={field}
        world={props.world}
        refs={drafts.refs[field.id] ?? []}
        typeLabel={props.typeLabel}
        onChange={props.onRefs}
        pickerOpen={props.pickerOpen}
        pickerQuery={props.pickerQuery}
      />
    );
  }
  if (field.kind === 'enum') {
    return allowsMany(field) ? (
      <EnumPills field={field} values={values} onChange={onText} />
    ) : (
      <EnumSelect field={field} value={values[0] ?? ''} onChange={(value) => onText([value])} />
    );
  }
  const shared = { field, invalid, describedBy: props.describedBy };
  if (!allowsMany(field)) {
    return (
      <OneValueEditor {...shared} value={values[0] ?? ''} onChange={(value) => onText([value])} />
    );
  }
  return field.kind === 'long_text' ? (
    <LongTextList {...shared} values={values} onChange={onText} />
  ) : (
    <ValueChips {...shared} values={values} onChange={onText} />
  );
}

/** One type field in the form. */
export function FieldRow(props: FieldRowProps) {
  const { field } = props;
  const problemId = props.error === undefined ? undefined : `field-${field.id}-problem`;
  const Sigma = INVENTORY_ICONS.computed;
  return (
    <div className="grid grid-cols-[10.5rem_minmax(0,1fr)] items-start gap-x-4 py-2">
      <Label
        htmlFor={`field-${field.id}`}
        className="flex min-h-9 items-center gap-1.5 text-sm font-normal text-muted-foreground"
      >
        {field.label}
        {field.computed === undefined ? null : (
          <Sigma className="size-3.5 text-app-accent" aria-label="Calculated field" />
        )}
      </Label>
      <div className="min-w-0">
        {field.computed === undefined ? (
          <StoredEditor {...props} describedBy={problemId} />
        ) : (
          <ComputedValue
            field={field}
            display={props.computed ?? { state: 'pending' }}
            override={props.override}
            onOverride={props.onOverride}
          />
        )}
        {props.error === undefined ? null : (
          <FieldProblem id={problemId}>{props.error}</FieldProblem>
        )}
      </div>
    </div>
  );
}
