import { Link2, MapPin, Plus, Users } from 'lucide-react';
import { useState } from 'react';

import {
  Button,
  ComboboxSelect,
  Popover,
  PopoverContent,
  PopoverTrigger,
  TextInput,
} from '@pops/ui';

import { EventLinkField } from './link-field';
import { useEventDetails } from './model';

import type { EventReference } from './model';

/** References are selected identities; venue and organiser creation adds one reusable local record. */
export function EventReferences() {
  return (
    <section className="space-y-1 border-b border-foreground/15 pb-3" aria-label="Event references">
      <ReferenceField kind="venue" label="Venue" />
      <ReferenceField kind="contact" label="Organiser" />
      <div className="flex items-start gap-2">
        <Link2 className="mt-3 size-4 shrink-0 text-app-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <EventLinkField
            field="sourceUrl"
            label="Event source URL"
            placeholder="Add source URL"
            openLabel="Open event source"
          />
        </div>
      </div>
    </section>
  );
}

function ReferenceField({ kind, label }: { kind: 'venue' | 'contact'; label: string }) {
  const { data } = useEventDetails();
  const field = kind === 'venue' ? 'venueId' : 'organiserId';
  const id = data.metadata[field];
  const selected = data.references.find((r) => r.id === id);
  const [open, setOpen] = useState(false);
  const Icon = kind === 'venue' ? MapPin : Users;
  return (
    <div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            aria-label={`Edit ${label.toLowerCase()}`}
            className="min-h-11 justify-start px-0"
          >
            <Icon className="size-4 text-app-accent" aria-hidden />
            {selected?.name ?? (id ? `${label} unavailable` : `Add ${label.toLowerCase()}`)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 space-y-3">
          <ReferenceEditor kind={kind} label={label} field={field} close={() => setOpen(false)} />
          {selected && <ReferenceFields reference={selected} />}
        </PopoverContent>
      </Popover>
      {selected?.address && <p className="pl-6 text-sm text-foreground/80">{selected.address}</p>}
    </div>
  );
}

function ReferenceEditor({
  kind,
  label,
  field,
  close,
}: {
  kind: 'venue' | 'contact';
  label: string;
  field: 'venueId' | 'organiserId';
  close: () => void;
}) {
  const { data, change } = useEventDetails();
  const [name, setName] = useState('');
  const id = data.metadata[field];
  const select = (value?: string) => {
    if (value !== id) change({ ...data, metadata: { ...data.metadata, [field]: value } });
    close();
  };
  function create() {
    if (!name.trim()) return;
    const newId = crypto.randomUUID();
    change({
      ...data,
      references: [...data.references, { id: newId, kind, name: name.trim() }],
      metadata: { ...data.metadata, [field]: newId },
    });
    close();
  }
  return (
    <>
      <ComboboxSelect
        aria-label={label}
        placeholder={`Choose ${label.toLowerCase()}`}
        value={id}
        options={data.references
          .filter((r) => r.kind === kind)
          .map((r) => ({ value: r.id, label: r.name }))}
        onChange={(value) => {
          if (typeof value === 'string') select(value);
        }}
      />
      <ReferenceCreate name={name} setName={setName} create={create} label={label} />
      {id && (
        <Button variant="ghost" onClick={() => select()}>
          Unlink
        </Button>
      )}
    </>
  );
}

function ReferenceFields({ reference }: { reference: EventReference }) {
  const { data, change } = useEventDetails();
  const update = (field: 'name' | 'address', value: string) => {
    if (value === reference[field]) return;
    change({
      ...data,
      references: data.references.map((r) =>
        r.id === reference.id ? { ...r, [field]: value } : r
      ),
    });
  };
  return (
    <div className="space-y-2 border-t pt-2">
      <TextInput
        label="Name"
        defaultValue={reference.name}
        key={`${reference.id}:${reference.name}`}
        onBlur={(e) => update('name', e.currentTarget.value)}
      />
      {reference.kind === 'venue' && (
        <TextInput
          label="Address"
          defaultValue={reference.address ?? ''}
          key={`${reference.id}:${reference.address ?? ''}`}
          onBlur={(e) => update('address', e.currentTarget.value)}
        />
      )}
    </div>
  );
}

function ReferenceCreate({
  name,
  setName,
  create,
  label,
}: {
  name: string;
  setName: (name: string) => void;
  create: () => void;
  label: string;
}) {
  return (
    <>
      <TextInput
        label={`New ${label.toLowerCase()} name`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') create();
        }}
      />
      <Button disabled={!name.trim()} onClick={create}>
        <Plus className="size-4" aria-hidden />
        Create {label.toLowerCase()}
      </Button>
    </>
  );
}
