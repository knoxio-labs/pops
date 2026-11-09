import { Plus } from 'lucide-react';
import { useState } from 'react';

import { Button, EntitySelect, Popover, PopoverContent, PopoverTrigger } from '@pops/ui';

import { useTripPeople } from './context';
import { linkTripPerson } from './model';

/** Links an existing contact without inferring a visit, availability, agreement or meeting date. */
export function AddTripPerson() {
  const { state, change } = useTripPeople();
  const [open, setOpen] = useState(false);
  const [contactId, select] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          select('');
          setError(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline">
          <Plus className="size-4" aria-hidden />
          Add person
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-full space-y-3">
        <h2 className="text-base font-medium">Existing person</h2>
        <EntitySelect
          aria-label="Existing person"
          entities={state.contacts.map((contact) => ({
            id: contact.id,
            name: contact.person.name,
          }))}
          value={contactId}
          onChange={select}
          placeholder="Choose contact"
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button
          type="button"
          disabled={!contactId}
          onClick={() => {
            const result = linkTripPerson(state, contactId, crypto.randomUUID());
            if (result.error) setError(result.error);
            else {
              change(result.state);
              setOpen(false);
            }
          }}
        >
          Link person
        </Button>
      </PopoverContent>
    </Popover>
  );
}
