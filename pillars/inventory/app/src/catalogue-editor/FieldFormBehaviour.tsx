import { Archive } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle, Label, Switch } from '@pops/ui';

import { ComputedFieldSection } from './computed/ComputedFieldSection';
import { useFieldFormContext } from './FieldFormContext';

/** Renders required, presentation and storage controls, and the computed-field editor. */
export function FieldFormBehaviour() {
  const { field, shapeLocked, storage } = useFieldFormContext();
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldToggle
          id="catalogue-required"
          label="Required"
          detail="Items must have at least one value."
          value="required"
        />
        <FieldToggle
          id="catalogue-highlighted"
          label="Highlighted"
          detail="Show this value in item summaries."
          value="highlighted"
        />
        <FieldToggle
          id="catalogue-computed"
          label="Computed field"
          detail="Evaluate a closed expression instead of storing a value."
          value="computed"
          disabled={shapeLocked}
        />
      </div>
      {storage === 'computed' && <ComputedFieldSection />}
      {shapeLocked && (
        <Alert>
          <Archive />
          <AlertTitle>Published shape is locked</AlertTitle>
          <AlertDescription>
            Replace this field to change its primitive, cardinality, storage, unit, or reference
            constraints.
          </AlertDescription>
        </Alert>
      )}
      {field?.archivedAt !== null && field?.archivedAt !== undefined && (
        <Alert>
          <Archive />
          <AlertTitle>This field is archived</AlertTitle>
          <AlertDescription>
            Existing items retain this definition, but new items cannot select it.
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}

function FieldToggle({
  detail,
  disabled = false,
  id,
  label,
  value,
}: {
  readonly detail: string;
  readonly disabled?: boolean;
  readonly id: string;
  readonly label: string;
  readonly value: 'required' | 'highlighted' | 'computed';
}) {
  const context = useFieldFormContext();
  const values = {
    required: context.required,
    highlighted: context.highlighted,
    computed: context.storage === 'computed',
  };
  const change = (checked: boolean) => {
    if (value === 'required') context.setRequired(checked);
    if (value === 'highlighted') context.setHighlighted(checked);
    if (value === 'computed') context.setStorage(checked ? 'computed' : 'stored');
  };
  return (
    <div className="flex min-h-11 items-start justify-between gap-4 rounded-lg border p-3">
      <div>
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </div>
      <Switch id={id} checked={values[value]} disabled={disabled} onCheckedChange={change} />
    </div>
  );
}
