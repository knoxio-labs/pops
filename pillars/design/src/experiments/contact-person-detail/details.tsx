import { Mail, MapPin, NotebookPen } from 'lucide-react';

import { Select } from '@pops/ui';

import { Field, Remove, Section } from './controls';
import { CopyContact } from './copy-contact';

import type { Person, ContactPoint, Address } from './model';

/** Repeatable identity details remain directly editable in one column. */
export function PersonDetails({
  person,
  change,
}: {
  person: Person;
  change: (next: Person) => void;
}) {
  return (
    <>
      <ContactMethods person={person} change={change} />
      <Addresses person={person} change={change} />
      <Section title="Notes" icon={<NotebookPen className="size-5" />}>
        <Field
          label="Notes"
          value={person.notes}
          update={(notes) => change({ ...person, notes })}
        />
      </Section>
    </>
  );
}

function ContactMethodRow({
  person,
  change,
  method,
}: {
  person: Person;
  change: (next: Person) => void;
  method: ContactPoint;
}) {
  const update = (next: typeof method) =>
    change({
      ...person,
      methods: person.methods.map((item) => (item.id === method.id ? next : item)),
    });
  return (
    <div
      key={method.id}
      className="group flex items-center gap-1 border-b border-foreground/15 px-2 last:border-b-0"
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 sm:flex-nowrap">
        <div className="w-28 shrink-0">
          <Select
            aria-label="Type"
            variant="ghost"
            value={method.kind}
            options={['Email', 'Phone', 'Social', 'Other'].map((value) => ({
              value,
              label: value,
            }))}
            onChange={(event) => update({ ...method, kind: event.target.value })}
          />
        </div>
        <div className="w-24 shrink-0">
          <Field
            label="Label"
            value={method.label}
            update={(label) => update({ ...method, label })}
          />
        </div>
        <div className="min-w-0 flex-1">
          <Field
            label="Contact value"
            value={method.value}
            update={(value) => update({ ...method, value })}
          />
        </div>
      </div>
      <CopyContact key={method.value} value={method.value} />
      <Remove
        name={method.label || method.kind}
        onClick={() =>
          change({
            ...person,
            methods: person.methods.filter((item) => item.id !== method.id),
          })
        }
      />
    </div>
  );
}

function AddressRow({
  person,
  change,
  address,
}: {
  person: Person;
  change: (next: Person) => void;
  address: Address;
}) {
  const update = (next: typeof address) =>
    change({
      ...person,
      addresses: person.addresses.map((item) => (item.id === address.id ? next : item)),
    });
  return (
    <div
      key={address.id}
      className="group flex items-center gap-1 border-b border-foreground/15 px-2 last:border-b-0"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="grid gap-1 sm:grid-cols-2">
          <Field
            label="Address label"
            value={address.label}
            update={(label) => update({ ...address, label })}
          />
          <Field
            label="City"
            value={address.city}
            update={(city) => update({ ...address, city })}
          />
        </div>
        <Field
          label="Address"
          value={address.address}
          update={(value) => update({ ...address, address: value })}
        />
      </div>
      <Remove
        name={address.label || 'address'}
        onClick={() =>
          change({
            ...person,
            addresses: person.addresses.filter((item) => item.id !== address.id),
          })
        }
      />
    </div>
  );
}

function ContactMethods({ person, change }: { person: Person; change: (next: Person) => void }) {
  return (
    <Section
      title="Contact methods"
      icon={<Mail className="size-5" />}
      add={() =>
        change({
          ...person,
          methods: [
            ...person.methods,
            { id: crypto.randomUUID(), kind: 'Email', label: '', value: '' },
          ],
        })
      }
    >
      {person.methods.map((method) => (
        <ContactMethodRow key={method.id} person={person} change={change} method={method} />
      ))}
    </Section>
  );
}

function Addresses({ person, change }: { person: Person; change: (next: Person) => void }) {
  return (
    <Section
      title="Addresses"
      icon={<MapPin className="size-5" />}
      add={() =>
        change({
          ...person,
          addresses: [
            ...person.addresses,
            { id: crypto.randomUUID(), label: '', city: '', address: '' },
          ],
        })
      }
    >
      {person.addresses.map((address) => (
        <AddressRow key={address.id} person={person} change={change} address={address} />
      ))}
    </Section>
  );
}
