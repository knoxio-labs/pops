/**
 * Editors for a field that holds one value, one per primitive kind. Each is
 * a kit control at the form's 36px height (with a 44px hit area where the
 * control is smaller), and each carries its unit or format in place rather
 * than in help text.
 */
import { Input, Label, Switch, Textarea, cn } from '@pops/ui';

import { PROBLEM_RING } from './field-note';

import type { CatalogueFieldKind } from '@/fixtures/inventory-type-fields';

import type { FormFieldDef } from './field-model';

/** Props every one-value editor takes. */
export interface OneEditorProps {
  field: FormFieldDef;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
}

const INPUT_TYPES: Partial<Record<CatalogueFieldKind, string>> = {
  date: 'date',
  date_time: 'datetime-local',
  url: 'url',
};

const PLACEHOLDERS: Partial<Record<CatalogueFieldKind, string>> = {
  integer: 'Whole number',
  decimal: '0.00',
  measurement: '0.0',
  url: 'https://',
};

const NUMERIC: ReadonlySet<CatalogueFieldKind> = new Set(['integer', 'decimal', 'measurement']);

function TextEditor({ field, value, onChange, invalid, describedBy, disabled }: OneEditorProps) {
  const numeric = NUMERIC.has(field.kind);
  return (
    <div className="relative">
      <Input
        id={`field-${field.id}`}
        type={INPUT_TYPES[field.kind] ?? 'text'}
        inputMode={numeric ? 'decimal' : undefined}
        value={value}
        placeholder={PLACEHOLDERS[field.kind]}
        disabled={disabled}
        aria-invalid={invalid === true ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'h-9',
          numeric && 'tabular-nums',
          field.unit !== undefined && 'pr-12',
          invalid && PROBLEM_RING
        )}
      />
      {field.unit === undefined ? null : (
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
          {field.unit}
        </span>
      )}
    </div>
  );
}

function LongTextEditor({
  field,
  value,
  onChange,
  invalid,
  describedBy,
  disabled,
}: OneEditorProps) {
  return (
    <Textarea
      id={`field-${field.id}`}
      value={value}
      rows={2}
      disabled={disabled}
      aria-invalid={invalid === true ? true : undefined}
      aria-describedby={describedBy}
      onChange={(event) => onChange(event.target.value)}
      className={cn('min-h-16 resize-none text-sm', invalid && PROBLEM_RING)}
    />
  );
}

function booleanText(value: string): string {
  if (value === '') return 'Not set';
  return value === 'true' ? 'Yes' : 'No';
}

function BooleanEditor({ field, value, onChange, disabled }: OneEditorProps) {
  const on = value === 'true';
  return (
    <div className="flex h-9 items-center gap-3">
      <Switch
        id={`field-${field.id}`}
        checked={on}
        disabled={disabled}
        onCheckedChange={(checked) => onChange(checked ? 'true' : 'false')}
      />
      <Label htmlFor={`field-${field.id}`} className="text-sm font-normal">
        {booleanText(value)}
      </Label>
    </div>
  );
}

/** The editor for one value of any kind except enum and reference, which have their own. */
export function OneValueEditor(props: OneEditorProps) {
  if (props.field.kind === 'long_text') return <LongTextEditor {...props} />;
  if (props.field.kind === 'boolean') return <BooleanEditor {...props} />;
  return <TextEditor {...props} />;
}
