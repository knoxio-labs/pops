import { CalendarDays, Route } from 'lucide-react';

import { Button, Select } from '@pops/ui';

import { AvailabilityRow } from './availability';
import { Field, Remove, Section } from './controls';
import { visitLabel, visitName, visits } from './model';

import type { Person, Plan } from './model';

/** Availability and trip plans use explicit cities, dates and visit references. */
export function PersonPlans({
  person,
  change,
}: {
  person: Person;
  change: (next: Person) => void;
}) {
  return (
    <>
      <AvailabilitySection person={person} change={change} />
      <TripPlansSection person={person} change={change} />
    </>
  );
}

function PlanRow({
  person,
  change,
  plan,
}: {
  person: Person;
  change: (next: Person) => void;
  plan: Plan;
}) {
  const update = (next: typeof plan) =>
    change({
      ...person,
      plans: person.plans.map((item) => (item.id === plan.id ? next : item)),
    });
  return (
    <div
      key={plan.id}
      className="group flex items-center gap-1 border-b border-foreground/15 px-2 last:border-b-0"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <Field label="Plan" value={plan.title} update={(title) => update({ ...plan, title })} />
        <Select
          aria-label="Visit reference"
          variant="ghost"
          value={plan.visit}
          options={[
            { value: '', label: 'Choose visit' },
            ...(!visits.some((visit) => visit.id === plan.visit) && plan.visit
              ? [{ value: plan.visit, label: visitName(plan.visit) }]
              : []),
            ...visits.map((visit) => ({ value: visit.id, label: visitLabel(visit) })),
          ]}
          onChange={(event) => update({ ...plan, visit: event.target.value })}
        />
        <Field
          label="Plan notes"
          value={plan.notes}
          update={(notes) => update({ ...plan, notes })}
        />
      </div>
      <Remove
        name={plan.title || 'plan'}
        onClick={() =>
          change({ ...person, plans: person.plans.filter((item) => item.id !== plan.id) })
        }
      />
    </div>
  );
}

function AvailabilitySection({
  person,
  change,
}: {
  person: Person;
  change: (next: Person) => void;
}) {
  return (
    <Section
      title="Availability"
      icon={<CalendarDays className="size-5" />}
      add={() =>
        change({
          ...person,
          availability: [
            ...person.availability,
            { id: crypto.randomUUID(), city: '', start: '', end: '', status: 'Unknown' },
          ],
        })
      }
    >
      {person.availability.map((entry) => (
        <AvailabilityRow key={entry.id} person={person} change={change} entry={entry} />
      ))}
    </Section>
  );
}

function TripPlansSection({ person, change }: { person: Person; change: (next: Person) => void }) {
  return (
    <Section
      title="Trip plans"
      icon={<Route className="size-5" />}
      add={() =>
        change({
          ...person,
          plans: [...person.plans, { id: crypto.randomUUID(), title: '', visit: '', notes: '' }],
        })
      }
    >
      <Button asChild variant="outline">
        <a target="_top" href="/design/x/trip-overview-shape/route-first/s/trips/overview">
          Brazil · trip overview
        </a>
      </Button>
      {person.plans.map((plan) => (
        <PlanRow key={plan.id} person={person} change={change} plan={plan} />
      ))}
    </Section>
  );
}
