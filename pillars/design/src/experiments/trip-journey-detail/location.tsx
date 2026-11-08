import { Check, MapPin, Plus } from 'lucide-react';
import { useState } from 'react';

import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
  TextInput,
} from '@pops/ui';

import { useJourney } from './context';
import { endpointLabel } from './model';

import type { JourneyEndpoint, JourneyLocation, JourneyState } from './model';

/** Choose a location by identity or create one without constraining the route to fixture airports. */
export function JourneyLocationPicker({
  endpoint,
  label,
  change,
}: {
  endpoint: JourneyEndpoint;
  label: string;
  change: (endpoint: JourneyEndpoint, state?: JourneyState) => void;
}) {
  const { state } = useJourney();
  const [open, setOpen] = useState(false);
  const display = selectedLocationLabel(state, endpoint, label);
  const select = (location: JourneyLocation, source = state) => {
    change({ ...endpoint, locationId: location.id, timeZone: location.timeZone }, source);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          aria-label={label}
          className="px-1 font-semibold"
          title={endpointLabel(state, endpoint)}
        >
          <MapPin className="size-4 text-app-accent" aria-hidden />
          {display}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-full p-0">
        <Command label={label}>
          <CommandInput placeholder="Find a location…" />
          <CommandList>
            <CommandEmpty>No matching locations</CommandEmpty>
            <CommandGroup>
              {state.locations.map((location) => (
                <CommandItem
                  key={location.id}
                  value={`${location.code} ${location.name}`}
                  onSelect={() => select(location)}
                  className="min-h-11 gap-2"
                >
                  <span className="flex-1">
                    {location.code} {location.name}
                  </span>
                  {location.id === endpoint.locationId && <Check className="size-4" aria-hidden />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        <NewLocation
          add={(location) =>
            select(location, { ...state, locations: [...state.locations, location] })
          }
        />
      </PopoverContent>
    </Popover>
  );
}

function NewLocation({ add }: { add: (location: JourneyLocation) => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [timeZone, setTimeZone] = useState('');
  return (
    <details className="border-t p-3">
      <summary className="min-h-11 cursor-pointer py-3 text-sm">New location</summary>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim())
            add({
              id: crypto.randomUUID(),
              name: name.trim(),
              code: code.trim(),
              timeZone: timeZone.trim(),
            });
        }}
      >
        <TextInput
          label="Location name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <TextInput label="Code" value={code} onChange={(event) => setCode(event.target.value)} />
        <TextInput
          label="Time zone"
          placeholder="Area/City"
          value={timeZone}
          onChange={(event) => setTimeZone(event.target.value)}
        />
        <Button type="submit" variant="outline" disabled={!name.trim()}>
          <Plus className="size-4" aria-hidden />
          Add location
        </Button>
      </form>
    </details>
  );
}

function selectedLocationLabel(
  state: JourneyState,
  endpoint: JourneyEndpoint,
  fallback: string
): string {
  const location = state.locations.find((item) => item.id === endpoint.locationId);
  if (location?.code) return location.code;
  return endpointLabel(state, endpoint) || fallback;
}
