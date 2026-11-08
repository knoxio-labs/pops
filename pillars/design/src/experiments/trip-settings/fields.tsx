import { CalendarDays, MapPin, Type } from 'lucide-react';

import { Textarea, TextInput } from '@pops/ui';

import { useSettings } from './context';
import { settingsTitle } from './model';

/** Capture destination text without classifying or geocoding it. */
export function DestinationField() {
  const { state, change } = useSettings();
  return (
    <TextInput
      label="Destination"
      prefix={<MapPin className="size-4" aria-hidden />}
      value={state.trip.destination}
      onChange={(event) =>
        change({ ...state, trip: { ...state.trip, destination: event.currentTarget.value } })
      }
    />
  );
}

/** A custom name overrides the deterministic title without overwriting its source fields. */
export function NameField() {
  const { state, change } = useSettings();
  return (
    <TextInput
      label="Name"
      prefix={<Type className="size-4" aria-hidden />}
      value={state.trip.name}
      placeholder={settingsTitle({ ...state.trip, name: '' })}
      onChange={(event) =>
        change({ ...state, trip: { ...state.trip, name: event.currentTarget.value } })
      }
    />
  );
}

/** Exact trip bounds remain independently optional and never change arrangements. */
export function DateFields() {
  const { state, change } = useSettings();
  return (
    <section className="space-y-3 border-t pt-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <CalendarDays className="size-4 text-app-accent" aria-hidden />
        Dates
      </h2>
      <div className="flex flex-wrap gap-3">
        {(['start', 'end'] as const).map((field) => (
          <TextInput
            key={field}
            label={field === 'start' ? 'Start' : 'End'}
            type="date"
            value={state.trip[field]}
            onChange={(event) =>
              change({ ...state, trip: { ...state.trip, [field]: event.currentTarget.value } })
            }
          />
        ))}
      </div>
    </section>
  );
}

/** Keep optional trip notes as source text rather than generated prose. */
export function NotesField() {
  const { state, change } = useSettings();
  return (
    <Textarea
      aria-label="Notes"
      value={state.trip.notes}
      onChange={(event) =>
        change({ ...state, trip: { ...state.trip, notes: event.currentTarget.value } })
      }
    />
  );
}
