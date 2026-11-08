import { FolderTree, Tag, X } from 'lucide-react';

import { Button, ComboboxSelect } from '@pops/ui';

import { useSettings } from './context';
import { eligibleParents } from './model';

/** A shared tag association uses its catalogue identity; removing it never deletes the tag. */
export function TagField() {
  const { state, change } = useSettings();
  const selected = state.tags.some((tag) => tag.id === state.trip.tagId);
  return (
    <section className="space-y-2 border-t pt-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Tag className="size-4 text-app-accent" aria-hidden />
        Shared tag
      </h2>
      <div className="flex items-center gap-2">
        <ComboboxSelect
          aria-label="Shared tag"
          value={selected ? state.trip.tagId : ''}
          options={state.tags.map((tag) => ({ value: tag.id, label: tag.name }))}
          placeholder="Choose tag"
          searchPlaceholder="Find a tag…"
          onChange={(value) => {
            if (typeof value === 'string')
              change({ ...state, trip: { ...state.trip, tagId: value } });
          }}
        />
        {state.trip.tagId && (
          <Button
            type="button"
            variant="ghost"
            aria-label="Unlink shared tag"
            onClick={() => change({ ...state, trip: { ...state.trip, tagId: '' } })}
          >
            <X className="size-4" aria-hidden />
          </Button>
        )}
      </div>
    </section>
  );
}

/** Parent selection excludes cycles while leaving trip dates and shared tags independent. */
export function ParentField() {
  const { state, change } = useSettings();
  const parents = eligibleParents(state);
  const selected = parents.some((trip) => trip.id === state.trip.parentId);
  return (
    <section className="space-y-2 border-t pt-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <FolderTree className="size-4 text-app-accent" aria-hidden />
        Parent trip
      </h2>
      <div className="flex items-center gap-2">
        <ComboboxSelect
          aria-label="Parent trip"
          value={selected ? state.trip.parentId : ''}
          options={parents.map((trip) => ({ value: trip.id, label: trip.name }))}
          placeholder="Choose trip"
          searchPlaceholder="Find a trip…"
          onChange={(value) => {
            if (typeof value === 'string')
              change({ ...state, trip: { ...state.trip, parentId: value } });
          }}
        />
        {state.trip.parentId && (
          <Button
            type="button"
            variant="ghost"
            aria-label="Remove parent trip"
            onClick={() => change({ ...state, trip: { ...state.trip, parentId: '' } })}
          >
            <X className="size-4" aria-hidden />
          </Button>
        )}
      </div>
    </section>
  );
}
