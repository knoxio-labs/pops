import { CheckSquare, Plus, Search, Square } from 'lucide-react';

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
      variant="outline"
      aria-pressed={selected}
      onClick={toggle}
      className="h-auto min-h-11 w-full justify-start gap-3 whitespace-normal border-border bg-card p-3 text-left text-sm"
    >
      <Icon className="size-5 shrink-0 text-app-accent" aria-hidden />
      <span className="min-w-0 space-y-1">
        <span className="block break-words font-medium">{label}</span>
        <span className="block text-xs font-normal text-muted-foreground">
          {[contactKindLabel(contact.kind), ...cities].join(' · ')}
        </span>
        {contact.methods.map((method) => (
          <span key={method.id} className="block break-words text-sm font-normal">
            {method.label && <span className="mr-2 text-muted-foreground">{method.label}</span>}
            {method.value}
          </span>
        ))}
        <span className="block text-xs font-normal text-muted-foreground">{contact.origin}</span>
      </span>
    </Button>
  );
}

/** Searches the complete directory and toggles independent source IDs without closing the picker. */
export function PickerSearch({ session }: { session: PickerSession }) {
  const contacts = visiblePickerContacts(session.state, session.query, session.kind);
  return (
    <div className="space-y-4">
      <TextInput
        label="Search contacts"
        className="text-sm"
        containerClassName="min-h-11"
        prefix={<Search className="size-4" aria-hidden />}
        value={session.query}
        onChange={(event) => session.setQuery(event.target.value)}
      />
      <div className="space-y-1.5">
        <label htmlFor="picker-kind" className="text-xs font-medium text-muted-foreground">
          Contact type
        </label>
        <ComboboxSelect
          id="picker-kind"
          aria-label="Contact type"
          className="min-h-11 text-sm"
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
      <section aria-label="Contact results" className="space-y-2">
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
      <Button
        type="button"
        variant="outline"
        className="min-h-11 text-sm text-app-accent"
        onClick={session.startCreation}
      >
        <Plus className="size-4" aria-hidden /> Create contact
      </Button>
    </div>
  );
}
