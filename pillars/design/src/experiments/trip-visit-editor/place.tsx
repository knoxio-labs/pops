import { MapPin, Plus } from 'lucide-react';
import { useState } from 'react';

import { Button, ComboboxSelect, TextInput } from '@pops/ui';

import { useVisitEditor } from './context';

/** Select a reusable city or capture an arbitrary city without changing another place. */
export function VisitPlace() {
  const { state, update, addPlace } = useVisitEditor();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <MapPin className="size-4 text-app-accent" aria-hidden />
        City
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <ComboboxSelect
          aria-label="City"
          value={
            state.places.some((place) => place.id === state.draft.placeId)
              ? state.draft.placeId
              : ''
          }
          options={state.places.map((place) => ({ value: place.id, label: place.name }))}
          placeholder="Choose city"
          searchPlaceholder="Find a city…"
          onChange={(value) => {
            if (typeof value === 'string') update({ ...state.draft, placeId: value });
          }}
        />
        <Button variant="ghost" onClick={() => setAdding(!adding)} aria-expanded={adding}>
          <Plus className="size-4" aria-hidden />
          New city
        </Button>
      </div>
      {adding && (
        <form
          className="flex flex-wrap items-end gap-2 rounded-lg border bg-background/50 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            addPlace(name);
            setName('');
            setAdding(false);
          }}
        >
          <TextInput
            label="City name"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            required
          />
          <Button type="submit" disabled={!name.trim()}>
            Add city
          </Button>
          <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </form>
      )}
    </section>
  );
}
