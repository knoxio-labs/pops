/**
 * Edit batch modal.
 *
 * Edits expiry / notes / prepState only. Other fields delegate to
 * Relocate / Adjust qty, matching the batch service split.
 */
import { type FormEvent, type ReactElement } from 'react';

import {
  Button,
  DateInput,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Select,
  type SelectOption,
} from '@pops/ui';

import { FieldRow, FormError, NotesField } from './form-controls.js';
import { type EditState, useEditBatchState } from './useEditBatchState.js';

export interface EditBatchModalProps {
  batchId: number | null;
  isOpen: boolean;
  onClose: () => void;
}

export function EditBatchModal({ batchId, isOpen, onClose }: EditBatchModalProps): ReactElement {
  const state = useEditBatchState({ batchId, isOpen, onClose });

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    if (batchId === null) return;
    state.setError(null);
    state.editMutation.mutate({
      id: batchId,
      ...buildEditPatch(state.form, state.isFromRun),
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit batch</DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <p className="text-sm text-muted-foreground">
            {state.detail.data?.ingredientName} / {state.detail.data?.variantName ?? '—'}
          </p>
          <EditFields
            form={state.form}
            setForm={state.setForm}
            isFromRun={state.isFromRun}
            prepStates={state.prepStates.data?.items ?? []}
          />
          <FormError message={state.error} />
          <ModalActions onClose={onClose} isPending={state.editMutation.isPending} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function resolvePrepStateForPatch(
  prepStateId: string,
  isFromRun: boolean
): number | null | undefined {
  if (isFromRun) return undefined;
  if (prepStateId.length === 0) return null;
  return Number(prepStateId);
}

function buildEditPatch(
  form: EditState,
  isFromRun: boolean
): {
  expiresAt: string | null;
  notes: string | null;
  prepStateId: number | null | undefined;
} {
  return {
    expiresAt: toIsoOrNull(form.expiresAt),
    notes: form.notes.trim().length === 0 ? null : form.notes.trim(),
    prepStateId: resolvePrepStateForPatch(form.prepStateId, isFromRun),
  };
}

function toIsoOrNull(yyyyMmDd: string): string | null {
  if (yyyyMmDd.length === 0) return null;
  // `<input type="date">` should always give us YYYY-MM-DD, but typed values
  // and browser quirks can produce something `new Date()` rejects. Clear
  // expiry in that case rather than letting `.toISOString()` throw.
  const d = new Date(`${yyyyMmDd}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

interface EditFieldsProps {
  form: EditState;
  setForm: (next: EditState) => void;
  isFromRun: boolean;
  prepStates: readonly { id: number; name: string }[];
}

function EditFields({ form, setForm, isFromRun, prepStates }: EditFieldsProps): ReactElement {
  return (
    <>
      <FieldRow label="Expires">
        <DateInput
          value={form.expiresAt}
          onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
        />
      </FieldRow>
      <PrepStateSelect
        form={form}
        setForm={setForm}
        isFromRun={isFromRun}
        prepStates={prepStates}
      />
      <NotesField
        label="Notes"
        value={form.notes}
        onChange={(notes) => setForm({ ...form, notes })}
      />
    </>
  );
}

function PrepStateSelect({
  form,
  setForm,
  isFromRun,
  prepStates,
}: {
  form: EditState;
  setForm: (next: EditState) => void;
  isFromRun: boolean;
  prepStates: readonly { id: number; name: string }[];
}): ReactElement {
  const options: SelectOption[] = [
    { value: '', label: '— none —' },
    ...prepStates.map((p) => ({ value: String(p.id), label: p.name })),
  ];
  return (
    <div className="space-y-1">
      <Select
        label="Prep state"
        value={form.prepStateId}
        onChange={(e) => setForm({ ...form, prepStateId: e.target.value })}
        options={options}
        disabled={isFromRun}
      />
      {isFromRun && (
        <span className="text-xs text-muted-foreground">
          Cook-yielded batches keep their original prep state.
        </span>
      )}
    </div>
  );
}

function ModalActions({
  onClose,
  isPending,
}: {
  onClose: () => void;
  isPending: boolean;
}): ReactElement {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
        Cancel
      </Button>
      <Button type="submit" disabled={isPending}>
        {isPending ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}
