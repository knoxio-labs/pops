import { valueTypeLabel } from '@pops/inventory/expression';
import {
  Label,
  SelectContent,
  SelectItem,
  SelectPrimitive,
  SelectTrigger,
  SelectValue,
} from '@pops/ui';

import { chooseReadField, fittingFields } from './builder-actions';
import { useBuilder } from './BuilderContext';

import type { ExpressionField } from '@pops/inventory/expression';

/**
 * Picks the field a read or assembly read lands on from `fields`, offering
 * only those that fit the selected slot, plus the current one if it no longer
 * does so the author can see what is wrong.
 */
export function FieldPicker({
  fields: candidates,
  fieldId,
  label,
}: {
  fields: readonly ExpressionField[];
  fieldId: string;
  label: string;
}) {
  const builder = useBuilder();
  const expected = builder.slots.get(builder.selectedPath);
  const fields = candidates.filter((field) => field.archived !== true);
  const fitting = fittingFields(fields, expected);
  const current = candidates.find((field) => field.id === fieldId);
  const options = [
    ...(current !== undefined && !fitting.includes(current) ? [current] : []),
    ...fitting,
  ];
  return (
    <div className="space-y-2">
      <Label htmlFor="read-field">{label}</Label>
      <SelectPrimitive
        value={fieldId}
        onValueChange={(next) => {
          if (next !== '')
            builder.change(chooseReadField(builder.root, builder.selectedPath, next));
        }}
      >
        <SelectTrigger id="read-field" className="min-h-11 w-full">
          <SelectValue placeholder="Choose a field" />
        </SelectTrigger>
        <SelectContent>
          {options.map((field) => (
            <SelectItem key={field.id} value={field.id}>
              {field.label}
              {field.storage === 'computed' && ' (computed)'}
            </SelectItem>
          ))}
        </SelectContent>
      </SelectPrimitive>
      <p className="text-xs text-muted-foreground">
        {fitting.length} of {fields.length} fields fit
        {expected === undefined ? '' : ` ${valueTypeLabel(expected)}`}. Fields holding many values
        cannot be read.
      </p>
    </div>
  );
}
