import { Check, Trash2 } from 'lucide-react';
import { Link } from 'react-router';

import { Button, NumberInput, Textarea } from '@pops/ui';

import { useEditableEntryDraft } from './useEditableEntryDraft.js';
import { usePlanEntryEdit } from './usePlanEntryEdit.js';

/**
 * The editable half of the plan entry sheet: the fields, the save/delete
 * buttons, and the mutation wiring behind them. Rendered only while the entry
 * has no `recipeRunId`; once it has one the sheet shows `CookedBody` instead
 * and nothing here is reachable.
 *
 * It lives beside `PlanEntryEditSheet` rather than inside it because the sheet
 * held six components in one file and sat two lines under the 200-line cap
 * (POPS-3291) — close enough that the next addition would have had to split it
 * first, as a prerequisite to whatever that change was actually about.
 */
import type { ReactElement } from 'react';

import type { WirePlanEntryRow } from './plan-wire-types.js';

interface PlanEntryEditFormProps {
  entry: WirePlanEntryRow;
  onSaved: () => void;
  onDeleted: () => void;
}

export function PlanEntryEditForm({
  entry,
  onSaved,
  onDeleted,
}: PlanEntryEditFormProps): ReactElement {
  const { servings, setServings, notes, setNotes } = useEditableEntryDraft(entry);
  const edit = usePlanEntryEdit({ entryId: entry.id, onSaved, onDeleted });
  return (
    <div className="space-y-4">
      <EditableFields
        servings={servings}
        setServings={setServings}
        notes={notes}
        setNotes={setNotes}
      />
      {edit.error !== null && (
        <p className="text-sm text-destructive" role="alert">
          {edit.error}
        </p>
      )}
      <EditButtons
        recipeSlug={entry.recipeSlug}
        entryId={entry.id}
        onSave={() => {
          if (servings !== '') edit.save(servings, notes);
        }}
        onDelete={edit.remove}
        isSaving={edit.isSaving}
        isSaveDisabled={servings === ''}
        isDeleting={edit.isDeleting}
      />
    </div>
  );
}

interface EditableFieldsProps {
  servings: number | '';
  setServings: (n: number | '') => void;
  notes: string;
  setNotes: (s: string) => void;
}

function EditableFields(props: EditableFieldsProps): ReactElement {
  return (
    <>
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="edit-servings">
          Planned servings
        </label>
        <NumberInput
          id="edit-servings"
          data-testid="edit-servings"
          min={1}
          value={props.servings}
          onChange={(e) => props.setServings(e.target.value === '' ? '' : Number(e.target.value))}
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="edit-notes">
          Notes
        </label>
        <Textarea
          id="edit-notes"
          data-testid="edit-notes"
          className="h-24"
          value={props.notes}
          onChange={(e) => props.setNotes(e.target.value)}
          maxLength={1000}
        />
      </div>
    </>
  );
}

interface EditButtonsProps {
  recipeSlug: string;
  entryId: number;
  onSave: () => void;
  onDelete: () => void;
  isSaving: boolean;
  isSaveDisabled: boolean;
  isDeleting: boolean;
}

function EditButtons(props: EditButtonsProps): ReactElement {
  return (
    <div className="flex flex-col gap-2 pt-2">
      <Button asChild data-testid="mark-cooked">
        <Link to={`/food/recipes/${props.recipeSlug}?cook=${props.entryId}`}>Mark cooked</Link>
      </Button>
      <Button
        onClick={props.onSave}
        variant="outline"
        disabled={props.isSaving || props.isSaveDisabled}
        data-testid="save-plan-entry"
      >
        <Check className="h-4 w-4 mr-1.5" /> Save changes
      </Button>
      <Button
        onClick={props.onDelete}
        variant="destructive"
        disabled={props.isDeleting}
        data-testid="delete-plan-entry"
      >
        <Trash2 className="h-4 w-4 mr-1.5" /> Delete
      </Button>
    </div>
  );
}
