import { RotateCcw, UserRound } from 'lucide-react';

import { Badge, Button } from '@pops/ui';

import { useRouteState } from '../trip-route-editing/canvas-state';
import { Field } from './controls';
import { PersonDetails } from './details';
import { initialPerson } from './model';
import { PersonPlans } from './plans';

import type { Scenario } from './model';

/** Compare section priority with identical editable data and a single undo stack. */
export function PersonWorkspace({
  layout,
  scenario = 'default',
}: {
  layout: 'details' | 'plans';
  scenario?: Scenario;
}) {
  const history = useRouteState(() => initialPerson(scenario));
  const { state: person, change } = history;
  const details = <PersonDetails person={person} change={change} />;
  const plans = <PersonPlans person={person} change={change} />;
  return (
    <>
      <PersonReview layout={layout} />
      <main className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
        <header className="flex items-center gap-4 rounded-xl border border-foreground/25 bg-app-accent/10 p-4">
          <div className="rounded-xl bg-app-accent p-3 text-app-accent-foreground">
            <UserRound className="size-6" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <Field
              label="Person name"
              prominent
              value={person.name}
              update={(name) => change({ ...person, name })}
            />
          </div>
          <Button variant="outline" disabled={!history.canUndo} onClick={history.undo}>
            <RotateCcw className="size-4" aria-hidden />
            Undo
          </Button>
        </header>
        {layout === 'details' ? (
          <>
            {details}
            {plans}
          </>
        ) : (
          <>
            {plans}
            {details}
          </>
        )}
      </main>
    </>
  );
}

function PersonReview({ layout }: { layout: 'details' | 'plans' }) {
  return (
    <aside className="space-y-2 border-b bg-muted px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">C02 · Review</Badge>
        <span className="text-xs text-muted-foreground">
          Fictional data · local edits reset on reload
        </span>
        {(['details', 'plans'] as const).map((id) => (
          <Button key={id} asChild variant={layout === id ? 'secondary' : 'ghost'}>
            <a target="_top" href={`/design/x/contact-person-detail/${id}/s/contacts/person`}>
              {id === 'details' ? 'Details first' : 'Plans first'}
            </a>
          </Button>
        ))}
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm">Proposals and questions</summary>
        <div className="space-y-2 pb-3 text-sm">
          <p>
            Details first prioritises reaching someone. Plans first prioritises meeting during a
            trip. Both expose the same fields and undo every local edit.
          </p>
          <p>
            Which section order suits opening a person from a trip? Are date overlap and conflicting
            availability clear enough? Are repeatable methods and addresses quick to edit?
          </p>
          <p>
            Source: fictional typed contact fields, explicit availability statements and local visit
            references. Overlap requires exact bounded dates in the same city; unknown dates produce
            no finding. Availability statements remain separate when they conflict. No generated
            text, remote writes or backend save status.
          </p>
        </div>
      </details>
    </aside>
  );
}
