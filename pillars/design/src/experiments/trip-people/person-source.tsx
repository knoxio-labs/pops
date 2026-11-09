import { CopyContact } from '../contact-person-detail/copy-contact';
import { shortArrangementDates } from '../trip-arrangements/format';
import { useTripPeople } from './context';

import type { TripPeopleContact } from './model';

/** Displays the selected contact's own facts read-only; meeting edits never become contact CRUD. */
export function TripPersonSource({ contact }: { contact: TripPeopleContact }) {
  const { person } = contact;
  return (
    <section
      aria-label={`Contact details for ${person.name}`}
      className="space-y-3 border-t border-border pt-3"
    >
      {person.notes && <p className="whitespace-pre-wrap text-sm">{person.notes}</p>}
      {person.methods.length > 0 && (
        <div className="divide-y divide-border">
          {person.methods.map((method) => (
            <div key={method.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  {[method.label, method.kind].filter(Boolean).join(' · ')}
                </p>
                <p className="break-words text-sm">{method.value}</p>
              </div>
              <CopyContact
                value={method.value}
                label={`Copy ${person.name} ${method.label || method.kind}`}
              />
            </div>
          ))}
        </div>
      )}
      {person.addresses.map((address) => (
        <div key={address.id}>
          <p className="text-xs text-muted-foreground">{address.label}</p>
          <p className="text-sm">{[address.address, address.city].filter(Boolean).join(' · ')}</p>
        </div>
      ))}
      {person.availability.length > 0 && <SourceAvailability contact={contact} />}
    </section>
  );
}

function SourceAvailability({ contact }: { contact: TripPeopleContact }) {
  const { state } = useTripPeople();
  return (
    <section aria-label="Source availability" className="space-y-2">
      <h3 className="text-sm font-medium">Availability</h3>
      {contact.person.availability.map((entry) => (
        <div key={entry.id} className="flex flex-wrap justify-between gap-2 text-sm">
          <span>{entry.status}</span>
          <span className="text-xs text-muted-foreground">
            {[
              entry.city
                ? (state.cities.find((city) => city.id === entry.city)?.name ??
                  'Location unavailable')
                : '',
              shortArrangementDates([entry.start, entry.end].filter(Boolean)),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
      ))}
    </section>
  );
}
