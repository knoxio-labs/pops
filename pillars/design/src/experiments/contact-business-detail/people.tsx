import { CopyContact } from '../contact-person-detail/copy-contact';
import { useBusiness } from './context';
import { BusinessEditor } from './editor';
import {
  businessContactLabel,
  locationLabel,
  removeBusinessPerson,
  saveBusinessPerson,
} from './model';

import type { BusinessState } from './model';

/** Shows reusable contact associations, preserving missing source references. */
export function BusinessPeople({
  people,
  title = 'People',
  locationId = '',
}: {
  people: BusinessState['people'];
  title?: string;
  locationId?: string;
}) {
  const { state } = useBusiness();
  return (
    <section aria-label={title} className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="divide-y rounded-xl bg-muted/50 px-4">
        {people.map((person) => {
          const contact = state.contacts.find((item) => item.id === person.contactId);
          return (
            <div className="flex items-center gap-1 py-2" key={person.id}>
              <div className="min-w-0 flex-1 space-y-1 py-1">
                <p className="font-medium">{businessContactLabel(state, person.contactId)}</p>
                {person.role && (
                  <div>
                    <p className="text-xs text-muted-foreground">Role</p>
                    <p>{person.role}</p>
                  </div>
                )}
                {person.locationId && (
                  <div>
                    <p className="text-xs text-muted-foreground">Location</p>
                    <p>{locationLabel(state, person.locationId)}</p>
                  </div>
                )}
                {contact?.method && (
                  <div>
                    <p className="text-xs text-muted-foreground">Contact method</p>
                    <p className="break-all">{contact.method}</p>
                  </div>
                )}
              </div>
              {contact?.method && (
                <CopyContact value={contact.method} label={`Copy ${contact.name} contact method`} />
              )}
              <PersonEditor person={person} />
            </div>
          );
        })}
        <div className="py-1">
          <PersonEditor person={{ id: '', contactId: '', role: '', locationId }} add />
        </div>
      </div>
    </section>
  );
}

function PersonEditor({
  person,
  add = false,
}: {
  person: BusinessState['people'][number];
  add?: boolean;
}) {
  const { state, change } = useBusiness();
  const contactOptions = state.contacts.map((item) => ({ value: item.id, label: item.name }));
  if (person.contactId && !state.contacts.some((item) => item.id === person.contactId))
    contactOptions.push({ value: person.contactId, label: 'Contact unavailable' });
  const locationOptions = [
    { value: '', label: 'No location' },
    ...state.locations.map((item) => ({ value: item.id, label: locationLabel(state, item.id) })),
  ];
  if (person.locationId && !state.locations.some((item) => item.id === person.locationId))
    locationOptions.push({ value: person.locationId, label: 'Location unavailable' });
  return (
    <BusinessEditor
      label={add ? 'Link person' : `Edit ${businessContactLabel(state, person.contactId)}`}
      add={add}
      values={person}
      validationMessage="Choose a contact and check the location."
      fields={[
        {
          key: 'contactId',
          label: 'Contact',
          options: contactOptions,
          placeholder: 'Select existing contact',
        },
        { key: 'role', label: 'Role' },
        {
          key: 'locationId',
          label: 'Location',
          options: locationOptions,
          placeholder: 'No location',
        },
      ]}
      save={(draft) => {
        const next = saveBusinessPerson(state, {
          id: add ? crypto.randomUUID() : person.id,
          contactId: draft.contactId ?? '',
          role: draft.role ?? '',
          locationId: draft.locationId ?? '',
        });
        change(next);
        return next !== state;
      }}
      remove={add ? undefined : () => change(removeBusinessPerson(state, person.id))}
    />
  );
}
