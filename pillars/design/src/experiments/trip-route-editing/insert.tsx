import { tripPlaces } from '@/fixtures/trip-places';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { Button, Popover, PopoverContent, PopoverTrigger, Select, cn } from '@pops/ui';

/** Hover or focus reveals an insertion picker; selecting a place inserts it immediately. */
export function InsertVisit({
  onAdd,
  label = 'Add visit',
  subtle = false,
}: {
  onAdd: (placeId: string) => void;
  label?: string;
  subtle?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          aria-label={label}
          title={label}
          className={cn(
            'min-h-11 min-w-11',
            subtle &&
              'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100'
          )}
        >
          <Plus className="size-4" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3">
        <Select
          autoFocus
          label={label}
          placeholder="City / region"
          value=""
          options={tripPlaces
            .filter((p) => p.kind !== 'airport')
            .map((p) => ({ value: p.id, label: p.name }))}
          onChange={(e) => {
            onAdd(e.target.value);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
