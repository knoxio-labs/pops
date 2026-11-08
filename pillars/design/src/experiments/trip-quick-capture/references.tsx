import { formatCityTiming } from '@/fixtures/trip-overview-format';
import { Check, ChevronsUpDown } from 'lucide-react';
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
} from '@pops/ui';

import { initialCanvas, canvasName } from '../trip-route-editing/canvas-model';

const canvas = initialCanvas('default');
const visits = canvas.records.filter((record) => record.kind === 'city');
const options = visits.map((record) => {
  const name = canvasName(canvas, record);
  const sameName = visits.filter((visit) => canvasName(canvas, visit) === name);
  const occurrence = sameName.length > 1 ? ` · ${sameName.indexOf(record) + 1}` : '';
  return {
    value: record.id,
    label:
      `${name}${occurrence}${record.timing ? ` · ${formatCityTiming(record.timing)}` : ''}`.replace(
        / · $/,
        ''
      ),
  };
});

/** Format a selected visit from its source record; missing identities never leak into copy. */
export function captureVisitLabel(id: string): string {
  return (
    options.find((option) => option.value === id)?.label ?? (id ? 'Visit unavailable' : 'Inbox')
  );
}

/** Capture may belong to the inbox or any existing visit, including an alternative. */
export function CaptureVisit({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const destinations = [
    { value: '', label: 'Inbox' },
    ...(value && !options.some((option) => option.value === value)
      ? [{ value, label: 'Visit unavailable' }]
      : []),
    ...options,
  ];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          role="combobox"
          aria-label="Capture destination"
          aria-expanded={open}
          className="w-full justify-between gap-2"
        >
          <span className="min-w-0 truncate">{captureVisitLabel(value)}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-foreground/70" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-full p-0">
        <Command label="Find a visit">
          <CommandInput placeholder="Find a visit…" />
          <CommandList>
            <CommandEmpty>No matching visits</CommandEmpty>
            <CommandGroup>
              {destinations.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  className="min-h-11 gap-2 whitespace-normal"
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1">{option.label}</span>
                  {option.value === value && (
                    <Check className="size-4 shrink-0 text-app-accent" aria-hidden />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
