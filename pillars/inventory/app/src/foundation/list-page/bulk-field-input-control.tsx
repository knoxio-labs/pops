import { Checkbox, ComboboxSelect, Input, Textarea } from '@pops/ui';

import type { ReactElement } from 'react';

import type { CatalogueType } from '../../inventory-web/useCatalogueLookups.js';
import type { BulkFieldInput } from './bulk-action-model.js';

function textInputType(
  field: CatalogueType['fields'][number]
): 'text' | 'number' | 'date' | 'datetime-local' | 'url' {
  if (field.kind === 'integer' || field.kind === 'decimal' || field.kind === 'measurement') {
    return 'number';
  }
  if (field.kind === 'date') return 'date';
  if (field.kind === 'date_time') return 'datetime-local';
  if (field.kind === 'url') return 'url';
  return 'text';
}

/** Renders the catalogue-specific control for a bulk field value. */
export function BulkFieldInputControl({
  field,
  value,
  onChange,
}: {
  field: CatalogueType['fields'][number];
  value: BulkFieldInput;
  onChange: (value: BulkFieldInput) => void;
}): ReactElement {
  if (field.kind === 'boolean') {
    return (
      <label className="flex min-h-11 items-center gap-3">
        <Checkbox
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
        <span className="text-sm">Yes</span>
      </label>
    );
  }
  if (field.kind === 'enum') {
    return (
      <ComboboxSelect
        aria-label={field.label}
        options={field.enumOptions
          .filter((option) => option.archivedAt === null)
          .map((option) => ({ value: option.id, label: option.label }))}
        value={typeof value === 'boolean' ? '' : value}
        multiple={field.cardinality === 'many'}
        onChange={onChange}
        placeholder="Choose an option"
        searchPlaceholder={`Search ${field.label.toLocaleLowerCase()}`}
        emptyMessage="No matching options"
      />
    );
  }
  if (field.kind === 'long_text') {
    return (
      <Textarea
        aria-label={field.label}
        value={typeof value === 'string' ? value : ''}
        rows={3}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  return (
    <Input
      aria-label={field.label}
      type={textInputType(field)}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
