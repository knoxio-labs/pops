import { BedDouble, Check, MapPin, Plane, Ticket } from 'lucide-react';

import { Badge } from '@pops/ui';

import { visitDateLabel } from '../trip-visit-editor/model';
import { useBusiness } from './context';
import { BusinessEditor } from './editor';
import { locationLabel, removeBusinessLocation, saveBusinessLocation } from './model';
import { BusinessPeople } from './people';

import type { BusinessState } from './model';

/** Displays read-only source arrangements with status-dependent outlines and visible missing references. */
export function BusinessArrangements({
  arrangements,
  showLocation = false,
}: {
  arrangements: BusinessState['arrangements'];
  showLocation?: boolean;
}) {
  const { state } = useBusiness();
  return (
    <div className="space-y-2">
      {arrangements.map((item) => (
        <article
          key={item.id}
          aria-label={item.title}
          className={`space-y-1 rounded-lg border border-foreground/25 p-3 ${item.status === 'Purchased' ? 'border-solid border-l-2 border-l-app-accent' : 'border-dashed'}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <ArrangementIcon kind={item.kind} />
              <h4 className="text-sm font-semibold leading-5 tracking-normal">{item.title}</h4>
            </div>
            <Badge
              variant="outline"
              className={
                item.status === 'Purchased'
                  ? 'border-transparent bg-app-accent text-app-accent-foreground'
                  : 'border-foreground/25'
              }
            >
              {item.status === 'Purchased' && <Check aria-hidden />}
              {item.status}
            </Badge>
          </div>
          <p className="text-sm">
            {[item.from, item.to].filter(Boolean).map(visitDateLabel).join(' — ')}
          </p>
          {showLocation && item.locationId && (
            <p className="text-sm text-muted-foreground">{locationLabel(state, item.locationId)}</p>
          )}
          {item.businessId !== state.business.id && (
            <p className="text-sm text-muted-foreground">Business unavailable</p>
          )}
        </article>
      ))}
    </div>
  );
}

/** Groups editable locations with their independent arrangement references and optionally associated people. */
export function BusinessLocations({ groupPeople }: { groupPeople: boolean }) {
  const { state } = useBusiness();
  const unresolved = state.arrangements.filter(
    (item) => !state.locations.some((location) => location.id === item.locationId)
  );
  return (
    <section aria-label="Locations" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold leading-6 tracking-normal">Locations</h2>
        <LocationEditor location={{ id: '', label: '', address: '', city: '' }} add />
      </div>
      {state.locations.map((location) => (
        <section
          aria-label={location.label || 'Location'}
          key={location.id}
          className="space-y-3 rounded-xl border border-foreground/20 bg-card p-4"
        >
          <LocationFacts location={location} />
          {groupPeople && (
            <BusinessPeople
              people={state.people.filter((person) => person.locationId === location.id)}
              title={`People at ${location.label || location.city || 'this location'}`}
              locationId={location.id}
            />
          )}
          {state.arrangements.some((item) => item.locationId === location.id) && (
            <div className="space-y-2 border-t border-foreground/15 pt-3">
              <h3 className="text-xs font-medium leading-5 tracking-normal text-muted-foreground">
                Related arrangements
              </h3>
              <BusinessArrangements
                arrangements={state.arrangements.filter((item) => item.locationId === location.id)}
              />
            </div>
          )}
        </section>
      ))}
      {unresolved.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold leading-5 tracking-normal">
            Other related arrangements
          </h3>
          <BusinessArrangements arrangements={unresolved} showLocation />
        </section>
      )}
    </section>
  );
}

function LocationEditor({
  location,
  add = false,
}: {
  location: BusinessState['locations'][number];
  add?: boolean;
}) {
  const { state, change } = useBusiness();
  return (
    <BusinessEditor
      label={add ? 'Add location' : `Edit ${location.label || 'location'}`}
      add={add}
      values={location}
      validationMessage="Enter a label, address or city."
      fields={[
        { key: 'label', label: 'Location label' },
        { key: 'address', label: 'Address' },
        { key: 'city', label: 'City' },
      ]}
      save={(draft) => {
        const next = saveBusinessLocation(state, {
          id: add ? crypto.randomUUID() : location.id,
          label: draft.label ?? '',
          address: draft.address ?? '',
          city: draft.city ?? '',
        });
        change(next);
        return next !== state;
      }}
      remove={add ? undefined : () => change(removeBusinessLocation(state, location.id))}
    />
  );
}

function LocationFacts({ location }: { location: BusinessState['locations'][number] }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-app-accent/15 text-app-accent">
        <MapPin className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        {location.label && (
          <h3 className="text-base font-semibold leading-6 tracking-normal">{location.label}</h3>
        )}
        {location.address && (
          <div>
            <p className="text-xs text-muted-foreground">Address</p>
            <p>{location.address}</p>
          </div>
        )}
        {location.city && (
          <div>
            <p className="text-xs text-muted-foreground">City</p>
            <p>{location.city}</p>
          </div>
        )}
      </div>
      <LocationEditor location={location} />
    </div>
  );
}

function ArrangementIcon({ kind }: { kind: BusinessState['arrangements'][number]['kind'] }) {
  const icons = { stay: BedDouble, journey: Plane, event: Ticket };
  const Icon = icons[kind];
  return <Icon className="size-4 shrink-0 text-app-accent" aria-hidden />;
}
