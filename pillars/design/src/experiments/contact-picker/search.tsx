import { CheckSquare, Search, Square } from 'lucide-react';

import { Button, ComboboxSelect, TextInput } from '@pops/ui';

import { directoryKinds } from '../contact-directory/model';
import { contactKindLabel } from '../contact-duplicates/facts';
import { pickerIdentityLabel } from './identity';
import { visiblePickerContacts } from './model';

import type { DirectoryContact } from '../contact-directory/model';
import type { PickerSession } from './session';

function ContactResult({
  contact,
  label,
  selected,
  toggle,
}: {
  contact: DirectoryContact;
  label: string;
  selected: boolean;
  toggle: () => void;
}) {
  const Icon = selected ? CheckSquare : Square;
  const cities = [...new Set(contact.addresses.map((address) => address.city).filter(Boolean))];
  return (
    <Button
      type="button"
      variant="ghost"
      aria-pressed={selected}
      onClick={toggle}
      className={`h-auto min-h-11 w-full justify-start gap-3 rounded-none px-3 py-2 text-left text-sm whitespace-normal ${selected ? 'bg-app-accent/10' : 'bg-transparent'}`}
    >
      <Icon className="size-4 shrink-0 text-app-accent" aria-hidden />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="min-w-0 break-words font-semibold">{label}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {contactKindLabel(contact.kind)}
          </span>
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {contact.origin}
          </span>
        </span>
        {(cities.length > 0 || contact.methods.length > 0) && (
          <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-normal text-muted-foreground">
            {cities.length > 0 && <span>{cities.join(' · ')}</span>}
            {contact.methods.map((method) => (
              <span key={method.id} className="break-words">
                {method.label && <span className="mr-1">{method.label}</span>}
                <span className="text-foreground">{method.value}</span>
              </span>
            ))}
          </span>
        )}
      </span>
    </Button>
  );
}

/** Searches the complete directory and toggles independent source IDs without closing the picker. */
export function PickerSearch({ session }: { session: PickerSession }) {
  const contacts = visiblePickerContacts(session.state, session.query, session.kind);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
        <TextInput
          aria-label="Search contacts"
          placeholder="Search contacts"
          className="text-sm"
          containerClassName="min-h-11 min-w-0 flex-1"
          prefix={<Search className="size-4" aria-hidden />}
          value={session.query}
          onChange={(event) => session.setQuery(event.target.value)}
        />
        <ComboboxSelect
          id="picker-kind"
          aria-label="Contact type"
          className="min-h-11 w-full text-sm sm:w-44"
          value={session.kind}
          placeholder="All types"
          options={[
            { value: '', label: 'All types' },
            ...directoryKinds.map(({ kind, label }) => ({ value: kind, label })),
          ]}
          onChange={(kind) => {
            if (typeof kind === 'string') session.setKind(kind);
          }}
        />
      </div>
      <section
        aria-label="Contact results"
        className="min-h-0 flex-1 divide-y divide-border overflow-y-auto rounded-lg border border-border"
      >
        {contacts.map((contact) => (
          <ContactResult
            key={contact.id}
            contact={contact}
            label={pickerIdentityLabel(session.state, contact.id)}
            selected={session.state.linkedIds.includes(contact.id)}
            toggle={() => session.toggle(contact.id)}
          />
        ))}
        {!contacts.length && (
          <p role="status" className="py-3 text-sm text-muted-foreground">
            No contacts found.
          </p>
        )}
      </section>
    </div>
  );
}
