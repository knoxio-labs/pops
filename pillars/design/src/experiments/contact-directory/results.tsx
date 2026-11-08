import { EntityAvatar } from '@/kit/entity-header';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { Badge, Button, SearchResultItem } from '@pops/ui';

import { useDirectory } from './context';
import { DirectoryDetails } from './details';
import { DirectoryIdentity } from './identity';
import { directoryKinds, groupContacts, visibleContacts } from './model';

import type { DirectoryContact } from './model';

function ContactRow({ contact }: { contact: DirectoryContact }) {
  const { state, change } = useDirectory();
  const selected = state.selectedId === contact.id;
  const Icon = selected ? ChevronUp : ChevronDown;
  const cities = [...new Set(contact.addresses.map((address) => address.city).filter(Boolean))];
  return (
    <li className="overflow-hidden rounded-xl border border-foreground/25 bg-muted/40">
      <Button
        aria-label={`Details for ${contact.name}`}
        aria-expanded={selected}
        variant="ghost"
        className={`relative h-auto min-h-11 w-full whitespace-normal ${selected ? 'block px-4 py-6 text-center' : 'justify-start px-3 py-3 text-left'}`}
        onClick={() => change({ ...state, selectedId: selected ? null : contact.id })}
      >
        {selected ? (
          <>
            <DirectoryIdentity contact={contact} />
            <ChevronUp
              className="absolute right-3 top-3 size-4 text-muted-foreground"
              aria-hidden
            />
          </>
        ) : (
          <SearchResultItem
            className="min-w-0 flex-1"
            leading={
              <EntityAvatar
                entity={
                  contact.legacy ?? { id: contact.id, name: contact.name, type: contact.kind }
                }
              />
            }
            title={contact.name}
            meta={[cities.join(', '), contact.aliases.join(', ')]}
            trailing={
              <span className="flex items-center gap-2">
                <Badge variant="outline">
                  {directoryKinds.find((item) => item.kind === contact.kind)?.label}
                </Badge>
                <Icon className="size-4 text-muted-foreground" />
              </span>
            }
          />
        )}
      </Button>
      {selected && <DirectoryDetails contact={contact} />}
    </li>
  );
}

/** Keep record identity intact in one list or in explicit source-type sections. */
export function DirectoryResults({ layout }: { layout: 'combined' | 'grouped' }) {
  const { state } = useDirectory();
  const contacts = visibleContacts(state);
  return (
    <section aria-label="Contact results" className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {contacts.length} {contacts.length === 1 ? 'contact' : 'contacts'}
      </p>
      {!contacts.length && (
        <p className="rounded-lg border border-dashed border-foreground/30 p-5 text-sm">
          {state.contacts.length ? 'No matching contacts' : 'No contacts'}
        </p>
      )}
      {layout === 'combined' ? (
        <ul className="space-y-2">
          {contacts.map((contact) => (
            <ContactRow key={contact.id} contact={contact} />
          ))}
        </ul>
      ) : (
        groupContacts(contacts).map((group) => (
          <section key={group.kind} aria-label={group.label} className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-app-accent">
              {group.label}
              <span className="text-muted-foreground">{group.contacts.length}</span>
            </h2>
            <ul className="space-y-2">
              {group.contacts.map((contact) => (
                <ContactRow key={contact.id} contact={contact} />
              ))}
            </ul>
          </section>
        ))
      )}
    </section>
  );
}
