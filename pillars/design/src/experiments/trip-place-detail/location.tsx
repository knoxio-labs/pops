import { MapPin, Plus, X } from 'lucide-react';
import { useState } from 'react';

import {
  Button,
  ComboboxSelect,
  TextInput,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@pops/ui';

import { useIdea } from './context';
import { IdeaText } from './fields';

/** Choose a source city or add an arbitrary one without forcing a dated visit. */
export function IdeaLocation() {
  const { state } = useIdea();
  return (
    <section aria-label="Idea location" className="space-y-1 border-t pt-3">
      <h2 className="text-xs font-medium text-muted-foreground">Location</h2>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" aria-label="Edit location">
            <MapPin className="size-4 text-app-accent" aria-hidden />
            {state.cities.find((city) => city.id === state.cityId)?.name ?? 'Add location'}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 space-y-3">
          <LocationFields />
        </PopoverContent>
      </Popover>
      <IdeaText field="address" label="Address" />
    </section>
  );
}

function LocationFields() {
  const { state, change } = useIdea();
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <MapPin className="size-4 text-app-accent" aria-hidden />
        <ComboboxSelect
          aria-label="City"
          value={state.cities.some((city) => city.id === state.cityId) ? state.cityId : ''}
          options={state.cities.map((city) => ({ value: city.id, label: city.name }))}
          placeholder="Choose city"
          searchPlaceholder="Find a city…"
          variant="ghost"
          onChange={(value) => {
            if (typeof value === 'string' && value !== state.cityId)
              change({ ...state, cityId: value });
          }}
        />
        {state.cityId && (
          <Button
            variant="ghost"
            aria-label="Unlink city"
            onClick={() => change({ ...state, cityId: '' })}
          >
            <X className="size-4" aria-hidden />
          </Button>
        )}
        <Button variant="ghost" aria-expanded={adding} onClick={() => setAdding(!adding)}>
          <Plus className="size-4" aria-hidden />
          New city
        </Button>
      </div>
      {adding && <NewCity close={() => setAdding(false)} />}
    </div>
  );
}

function NewCity({ close }: { close: () => void }) {
  const { state, change } = useIdea();
  const [name, setName] = useState('');
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        const city = { id: crypto.randomUUID(), name: name.trim() };
        change({ ...state, cities: [...state.cities, city], cityId: city.id });
        close();
        setName('');
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
      <Button type="button" variant="ghost" onClick={close}>
        Cancel
      </Button>
    </form>
  );
}
