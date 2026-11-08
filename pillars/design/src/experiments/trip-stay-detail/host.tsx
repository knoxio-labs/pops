import { Plus, UserRound, X } from 'lucide-react';
import { useState } from 'react';

import { Button, ComboboxSelect, TextInput } from '@pops/ui';

import { useStay } from './context';

/** Link a reusable contact identity; clearing a link preserves its source contact. */
export function StayHost() {
  const { state, change } = useStay();
  const [adding, setAdding] = useState(false);
  const host = state.hosts.find((item) => item.id === state.hostId);
  return (
    <section aria-label="Stay host" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <UserRound className="size-4 text-app-accent" aria-hidden />
        <ComboboxSelect
          aria-label="Host"
          value={host?.id ?? ''}
          options={state.hosts.map((item) => ({ value: item.id, label: item.name }))}
          placeholder="Choose host"
          searchPlaceholder="Find a contact…"
          variant="ghost"
          onChange={(value) => {
            if (typeof value === 'string' && value !== state.hostId)
              change({ ...state, hostId: value });
          }}
        />
        {state.hostId && (
          <Button
            variant="ghost"
            aria-label="Unlink host"
            onClick={() => change({ ...state, hostId: '' })}
          >
            <X className="size-4" aria-hidden />
          </Button>
        )}
        <Button variant="ghost" onClick={() => setAdding(!adding)} aria-expanded={adding}>
          <Plus className="size-4" aria-hidden />
          New contact
        </Button>
      </div>
      {host?.method && <p className="pl-6 text-sm text-muted-foreground">{host.method}</p>}
      {adding && <NewHost close={() => setAdding(false)} />}
    </section>
  );
}

function NewHost({ close }: { close: () => void }) {
  const { state, change } = useStay();
  const [name, setName] = useState('');
  const [method, setMethod] = useState('');
  return (
    <form
      className="space-y-2 rounded-lg border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        const host = { id: crypto.randomUUID(), name: name.trim(), method: method.trim() };
        change({ ...state, hosts: [...state.hosts, host], hostId: host.id });
        close();
      }}
    >
      <TextInput
        label="Contact name"
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
        required
      />
      <TextInput
        label="Contact method"
        value={method}
        onChange={(event) => setMethod(event.currentTarget.value)}
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={!name.trim()}>
          Add contact
        </Button>
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
