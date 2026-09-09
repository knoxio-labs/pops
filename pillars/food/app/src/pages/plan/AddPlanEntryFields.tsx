import { Autocomplete, NumberInput, Textarea } from '@pops/ui';

/**
 * Form-field block for `AddPlanEntryModal` — split out so the parent
 * fits within the per-function line cap.
 */
import type { ReactElement } from 'react';

export interface RecipeOption {
  value: string;
  label: string;
}

export interface AddPlanEntryFieldsProps {
  search: string;
  setSearch: (next: string) => void;
  options: RecipeOption[];
  recipeId: number | null;
  setRecipeId: (next: number | null) => void;
  isRecipesLoading: boolean;
  plannedServings: number;
  setPlannedServings: (next: number) => void;
  notes: string;
  setNotes: (next: string) => void;
  error: string | null;
}

export function AddPlanEntryFields(props: AddPlanEntryFieldsProps): ReactElement {
  return (
    <div className="space-y-4 py-2">
      <RecipePicker {...props} />
      <ServingsField
        plannedServings={props.plannedServings}
        setPlannedServings={props.setPlannedServings}
      />
      <NotesField notes={props.notes} setNotes={props.setNotes} />
      {props.error !== null && (
        <p className="text-sm text-destructive" role="alert">
          {props.error}
        </p>
      )}
    </div>
  );
}

function RecipePicker(props: AddPlanEntryFieldsProps): ReactElement {
  return (
    <div>
      <label className="block text-sm font-medium mb-1" htmlFor="add-plan-recipe-search">
        Recipe
      </label>
      <Autocomplete
        id="add-plan-recipe-search"
        // Radix's `PopoverTrigger asChild` overwrites the `id` the kit puts on
        // the input, so `htmlFor` above never associates and the field would
        // otherwise reach a screen reader unnamed (POPS-3282).
        aria-label="Recipe"
        suggestions={props.options}
        value={props.search}
        // Every keystroke invalidates an earlier pick: the query the field now
        // shows is no longer the recipe held in state. `Autocomplete` fires this
        // before `onSelect`, so selecting a suggestion still lands on the new id.
        onChange={(next) => {
          props.setSearch(next);
          props.setRecipeId(null);
        }}
        onSelect={(suggestion) => props.setRecipeId(Number(suggestion.value))}
        placeholder="Search recipes…"
        // Not the kit's `loading` prop: that only suppresses the empty message,
        // which would leave an in-flight search showing nothing at all. Swapping
        // the message keeps an indicator and still never flashes "no matches".
        emptyMessage={props.isRecipesLoading ? 'Loading…' : 'No recipes match.'}
      />
    </div>
  );
}

function ServingsField(props: {
  plannedServings: number;
  setPlannedServings: (n: number) => void;
}): ReactElement {
  return (
    <div>
      <label className="block text-sm font-medium mb-1" htmlFor="add-plan-servings">
        Planned servings
      </label>
      <NumberInput
        id="add-plan-servings"
        data-testid="add-plan-servings"
        min={1}
        value={props.plannedServings}
        // `NaN` carries the cleared field: `NumberInput` renders it as empty and
        // `canSubmit` rejects it, so clearing no longer snaps the value back to 1.
        onChange={(e) =>
          props.setPlannedServings(e.target.value === '' ? Number.NaN : Number(e.target.value))
        }
        // `NumberInput` clamps its steppers but passes typed text through
        // unclamped, so `min` is enforced here — on blur rather than per
        // keystroke, which would fight anyone typing a value that starts "0".
        onBlur={(e) => {
          const typed = Number(e.target.value);
          if (e.target.value !== '' && typed < 1) props.setPlannedServings(1);
        }}
      />
    </div>
  );
}

function NotesField(props: { notes: string; setNotes: (s: string) => void }): ReactElement {
  return (
    <div>
      <label className="block text-sm font-medium mb-1" htmlFor="add-plan-notes">
        Notes (optional)
      </label>
      <Textarea
        id="add-plan-notes"
        data-testid="add-plan-notes"
        className="h-20"
        value={props.notes}
        onChange={(e) => props.setNotes(e.target.value)}
        maxLength={1000}
      />
    </div>
  );
}
