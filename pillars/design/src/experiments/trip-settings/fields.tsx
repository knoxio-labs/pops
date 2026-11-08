import { MapPin, Type } from 'lucide-react';

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

/** A plain source subtitle preserves uncertain timing without parsing or assigning dates. */
export function WhenField() {
  const { state, change } = useSettings();
  return (
    <TextInput
      label="When"
      placeholder="Summer, around July, after graduation…"
      value={state.trip.when}
      onChange={(event) =>
        change({ ...state, trip: { ...state.trip, when: event.currentTarget.value } })
      }
    />
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
