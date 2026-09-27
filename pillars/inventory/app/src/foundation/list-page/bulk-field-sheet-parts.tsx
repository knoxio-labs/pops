import { Button, Label, Select } from '@pops/ui';

import { bulkItemCount, type BulkFieldInput } from './bulk-action-model.js';
import { BulkFieldInputControl } from './bulk-field-input-control.js';

import type { ReactElement } from 'react';

import type { FieldValuePatch } from '../../inventory-web/commands.js';
import type { CatalogueType } from '../../inventory-web/useCatalogueLookups.js';
import type { BulkActionState } from './bulk-action-types.js';

function FieldExplanation({
  field,
  compatibleCount,
  skipped,
}: {
  field: CatalogueType['fields'][number];
  compatibleCount: number;
  skipped: number;
}): ReactElement {
  return (
    <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      Replaces {field.label} on {bulkItemCount(compatibleCount)}.
      {skipped > 0 ? ` ${skipped} have no ${field.label} field and stay as they are.` : ''} Undo
      reverts all of them while the toast shows.
    </p>
  );
}

/** Renders the field selector and typed input inside the bulk field sheet. */
export function BulkFieldSheetContent({
  action,
  fields,
  selectedFieldId,
  field,
  input,
  compatibleCount,
  setFieldId,
  setInputState,
}: {
  action: BulkActionState;
  fields: readonly {
    field: CatalogueType['fields'][number];
    have: number;
  }[];
  selectedFieldId: string;
  field: CatalogueType['fields'][number] | undefined;
  input: BulkFieldInput;
  compatibleCount: number;
  setFieldId: (fieldId: string) => void;
  setInputState: (state: { fieldId: string; value: BulkFieldInput }) => void;
}): ReactElement {
  if (field === undefined) {
    return (
      <p className="rounded-lg border px-3 py-2 text-sm text-muted-foreground">
        None of the selected items has a writable catalogue field.
      </p>
    );
  }
  const skipped = action.ids.length - compatibleCount;
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="bulk-field">Field</Label>
        <Select
          id="bulk-field"
          value={selectedFieldId}
          options={fields.map((candidate) => ({
            value: candidate.field.id,
            label: `${candidate.field.label}: ${candidate.have} of ${bulkItemCount(action.ids.length)} have it`,
          }))}
          onChange={(event) => setFieldId(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bulk-value">{field.label}</Label>
        <BulkFieldInputControl
          field={field}
          value={input}
          onChange={(value) => setInputState({ fieldId: field.id, value })}
        />
      </div>
      <FieldExplanation field={field} compatibleCount={compatibleCount} skipped={skipped} />
    </div>
  );
}

/** Renders the cancel and confirm controls for the bulk field sheet. */
export function BulkFieldSheetFooter({
  field,
  input,
  compatibleCount,
  patch,
  busy,
  onOpenChange,
  onConfirm,
}: {
  field: CatalogueType['fields'][number] | undefined;
  input: BulkFieldInput;
  compatibleCount: number;
  patch: FieldValuePatch | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (fieldId: string, input: BulkFieldInput) => Promise<void>;
}): ReactElement {
  return (
    <div className="mt-6 flex items-center justify-end gap-2 border-t pt-4">
      <Button variant="ghost" onClick={() => onOpenChange(false)}>
        Cancel
      </Button>
      <Button
        disabled={field === undefined || patch === null || busy}
        onClick={() => {
          if (field !== undefined && patch !== null) void onConfirm(field.id, input);
        }}
      >
        Set on {bulkItemCount(compatibleCount)}
      </Button>
    </div>
  );
}
