import { RotateCcw } from 'lucide-react';
import { useMemo } from 'react';

import { Button } from '@pops/ui';

import { DirectoryIdentity } from '../contact-directory/identity';
import { useRouteState } from '../trip-route-editing/canvas-state';
import { BusinessContext, useBusiness } from './context';
import { BusinessDetails } from './details';
import { BusinessEditor } from './editor';
import { createBusinessState } from './fixture';
import { BusinessLocations } from './locations';
import { businessReferenceFindings, updateBusinessIdentity } from './model';
import { BusinessPeople } from './people';
import { BusinessReview } from './review';

import type { BusinessScenario } from './model';

/** Compares two single-column groupings over identical source facts and one shared undo history. */
export function BusinessWorkspace({
  layout,
  scenario = 'default',
}: {
  layout: 'details' | 'locations';
  scenario?: BusinessScenario;
}) {
  const history = useRouteState(() => createBusinessState(scenario));
  const { state, change } = history;
  const findings = businessReferenceFindings(state);
  const unassigned = state.people.filter(
    (person) => !state.locations.some((location) => location.id === person.locationId)
  );
  const context = useMemo(() => ({ state, change }), [state, change]);
  return (
    <BusinessContext.Provider value={context}>
      <BusinessReview layout={layout} />
      <main className="mx-auto max-w-2xl space-y-6 p-4 pb-24 text-sm leading-6 md:p-6 md:pb-24">
        <div className="flex justify-end">
          <Button
            variant="ghost"
            className="min-h-11"
            disabled={!history.canUndo}
            onClick={history.undo}
          >
            <RotateCcw className="size-4" aria-hidden />
            Undo
          </Button>
        </div>
        <BusinessHero />
        {layout === 'details' ? (
          <>
            <BusinessDetails />
            <BusinessPeople people={state.people} />
            <BusinessLocations groupPeople={false} />
          </>
        ) : (
          <>
            <BusinessLocations groupPeople />
            <BusinessPeople people={unassigned} title="Other linked people" />
            <BusinessDetails />
          </>
        )}
        {findings.length > 0 && (
          <section aria-label="Unavailable references" className="space-y-2 rounded-xl border p-4">
            <h2 className="text-sm font-medium leading-5 tracking-normal">
              Unavailable references
            </h2>
            {findings.map((finding) => (
              <p key={finding.id} className="text-sm text-muted-foreground">
                {finding.message}
              </p>
            ))}
          </section>
        )}
      </main>
    </BusinessContext.Provider>
  );
}

function BusinessHero() {
  const { state, change } = useBusiness();
  return (
    <header className="space-y-4">
      <DirectoryIdentity contact={state.business} />
      <div
        className={`flex items-center gap-2 ${state.business.notes ? 'rounded-xl border border-foreground/15 bg-card p-4' : 'justify-end'}`}
      >
        {state.business.notes && (
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Notes</p>
            <p className="whitespace-pre-wrap">{state.business.notes}</p>
          </div>
        )}
        <BusinessEditor
          label="Edit name and notes"
          validationMessage="Enter a name."
          values={{ name: state.business.name, notes: state.business.notes }}
          fields={[
            { key: 'name', label: 'Name' },
            { key: 'notes', label: 'Notes' },
          ]}
          save={(draft) => {
            const next = updateBusinessIdentity(state, {
              name: draft.name ?? '',
              notes: draft.notes ?? '',
            });
            change(next);
            return next !== state;
          }}
        />
      </div>
    </header>
  );
}
