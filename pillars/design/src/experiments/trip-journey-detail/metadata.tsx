import { Check } from 'lucide-react';
import { useState } from 'react';

import { Button, Popover, PopoverContent, PopoverTrigger, TextInput } from '@pops/ui';

import { useJourney } from './context';
import { legLabel } from './display';
import { transportModes, updateLeg } from './model';

import type { JourneyLeg } from './model';

const statuses: JourneyLeg['status'][] = ['Considering', 'Reserved', 'Purchased'];

/** Purchase state belongs to this leg; changing another leg cannot harden it. */
export function LegStatus({ leg }: { leg: JourneyLeg }) {
  const { state, change } = useJourney();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={leg.status === 'Purchased' ? 'secondary' : 'ghost'}
          aria-label={`Status · ${legLabel(state, leg)}`}
        >
          {leg.status === 'Purchased' && <Check className="size-4" aria-hidden />}
          {leg.status}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 space-y-1">
        {statuses.map((status) => (
          <Button
            key={status}
            className="w-full justify-start"
            variant={leg.status === status ? 'secondary' : 'ghost'}
            onClick={() => {
              if (leg.status !== status) change(updateLeg(state, { ...leg, status }));
              setOpen(false);
            }}
          >
            {status}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** Operator names, service numbers and references are user source fields, separate from locations. */
export function LegMetadata({ leg }: { leg: JourneyLeg }) {
  const { state, change } = useJourney();
  return (
    <details>
      <summary className="min-h-11 cursor-pointer py-3 text-sm">
        {[leg.operator, leg.service, leg.reference].filter(Boolean).join(' · ') ||
          'Operator and reference'}
      </summary>
      <div className="flex flex-wrap gap-2">
        {(['operator', 'service', 'reference'] as const).map((field) => (
          <TextInput
            key={`${leg.id}-${field}-${leg[field]}`}
            label={field === 'service' ? 'Service number' : field}
            aria-label={`${field} · ${legLabel(state, leg)}`}
            variant="ghost"
            containerClassName="bg-transparent"
            defaultValue={leg[field]}
            onBlur={(event) => {
              if (event.currentTarget.value !== leg[field])
                change(updateLeg(state, { ...leg, [field]: event.currentTarget.value }));
            }}
          />
        ))}
      </div>
    </details>
  );
}

/** Mode selection uses the model's presentation catalogue and retains every timing field. */
export function LegMode({ leg }: { leg: JourneyLeg }) {
  const { state, change } = useJourney();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" aria-label={`Transport mode · ${legLabel(state, leg)}`}>
          {transportModes.find((mode) => mode.id === leg.mode)?.label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 space-y-1">
        {transportModes.map((mode) => (
          <Button
            key={mode.id}
            className="w-full justify-start"
            variant={leg.mode === mode.id ? 'secondary' : 'ghost'}
            onClick={() => {
              if (mode.id !== leg.mode) change(updateLeg(state, { ...leg, mode: mode.id }));
              setOpen(false);
            }}
          >
            {mode.label}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
