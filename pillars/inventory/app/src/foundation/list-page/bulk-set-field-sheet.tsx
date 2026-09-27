import { useMemo, useState } from 'react';

import { Sheet } from '@pops/ui';

import {
  bulkFieldCandidates,
  bulkFieldPatch,
  bulkItemCount,
  initialBulkFieldInput,
  type BulkFieldInput,
} from './bulk-action-model.js';
import { BulkFieldSheetContent, BulkFieldSheetFooter } from './bulk-field-sheet-parts.js';

import type { ReactElement } from 'react';

import type {
  CatalogueDescriptor,
  CatalogueType,
} from '../../inventory-web/useCatalogueLookups.js';
import type { ItemRowModel } from '../model/model.js';
import type { BulkActionState } from './bulk-action-types.js';

interface BulkFieldInputState {
  readonly fieldId: string;
  readonly value: BulkFieldInput;
}

function selectedField(
  fields: readonly { field: CatalogueType['fields'][number] }[],
  fieldId: string
): CatalogueType['fields'][number] | undefined {
  return fields.find((candidate) => candidate.field.id === fieldId)?.field;
}

function fieldInputValue(
  field: CatalogueType['fields'][number] | undefined,
  inputState: BulkFieldInputState
): BulkFieldInput {
  if (field === undefined) return '';
  if (inputState.fieldId === field.id) return inputState.value;
  return initialBulkFieldInput(field);
}

/** The live sheet for applying one typed field value to compatible selected items. */
export function BulkSetFieldSheet({
  action,
  rows,
  catalogue,
  busy,
  onOpenChange,
  onConfirm,
}: {
  action: BulkActionState;
  rows: readonly ItemRowModel[];
  catalogue: CatalogueDescriptor | undefined;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (fieldId: string, input: BulkFieldInput) => Promise<void>;
}): ReactElement {
  const fields = useMemo(
    () => bulkFieldCandidates(rows, action.ids, catalogue),
    [action.ids, catalogue, rows]
  );
  const [fieldId, setFieldId] = useState(fields[0]?.field.id ?? '');
  const selectedFieldId = fields.some((candidate) => candidate.field.id === fieldId)
    ? fieldId
    : (fields[0]?.field.id ?? '');
  const field = selectedField(fields, selectedFieldId);
  const [inputState, setInputState] = useState<BulkFieldInputState>({
    fieldId: '',
    value: '',
  });
  const input = fieldInputValue(field, inputState);
  const compatibleCount =
    fields.find((candidate) => candidate.field.id === selectedFieldId)?.have ?? 0;
  return (
    <Sheet
      open
      onOpenChange={onOpenChange}
      title={`Set a field on ${bulkItemCount(action.ids.length)}`}
      description="One field, one value. Each item's change is its own history event."
    >
      <BulkFieldSheetContent
        action={action}
        fields={fields}
        selectedFieldId={selectedFieldId}
        field={field}
        input={input}
        compatibleCount={compatibleCount}
        setFieldId={setFieldId}
        setInputState={setInputState}
      />
      <BulkFieldSheetFooter
        field={field}
        input={input}
        compatibleCount={compatibleCount}
        patch={field === undefined ? null : bulkFieldPatch(field, input)}
        busy={busy}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />
    </Sheet>
  );
}
