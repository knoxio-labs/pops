import { Plus } from 'lucide-react';
import { useState } from 'react';

import { Button, Popover, PopoverContent, PopoverTrigger } from '@pops/ui';

import { useJourney } from './context';
import { addLeg, transportModes } from './model';

/** Add an explicitly chosen transport mode to the mounted journey. */
export function AddTransport() {
  const { state, change } = useJourney();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex justify-center border-t border-dotted border-foreground/30 py-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline">
            <Plus className="size-4" aria-hidden />
            Add transport
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 space-y-1">
          {transportModes.map((mode) => (
            <Button
              key={mode.id}
              variant="ghost"
              className="w-full justify-start"
              onClick={() => {
                change(addLeg(state, mode.id));
                setOpen(false);
              }}
            >
              {mode.label}
            </Button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
