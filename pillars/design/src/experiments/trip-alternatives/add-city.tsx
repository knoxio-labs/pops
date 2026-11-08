import { Plus } from 'lucide-react';
import { useState } from 'react';

import { Button, TextInput } from '@pops/ui';

/** Submit an explicit city name without constraining it to fixture options. */
export function AddCity({
  label,
  action,
  add,
}: {
  label: string;
  action: string;
  add: (name: string) => void;
}) {
  const [name, setName] = useState('');
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) {
          add(name.trim());
          setName('');
        }
      }}
    >
      <TextInput
        label={label}
        value={name}
        onChange={(event) => setName(event.target.value)}
        containerClassName="bg-background/50"
      />
      <Button type="submit" variant="outline" disabled={!name.trim()}>
        <Plus className="size-4" aria-hidden />
        {action}
      </Button>
    </form>
  );
}
