import { MapPin, Plus } from 'lucide-react';
import { Fragment } from 'react';

import { Button } from '@pops/ui';

import { useVisitEditor } from './context';
import { routeLabel, visitTimingLabel } from './model';

import type { ReactNode } from 'react';

/** Show surrounding visits with insertion controls on the route connections. */
export function VisitTimeline({
  editor,
  canInsert,
  insert,
}: {
  editor: ReactNode;
  canInsert: boolean;
  insert: (id: string) => void;
}) {
  const { state } = useVisitEditor();
  return (
    <div>
      {state.visits.map((visit) => (
        <Fragment key={visit.id}>
          <div className="flex gap-3">
            <div
              className="w-28 shrink-0 pt-3 text-right text-xs text-muted-foreground"
              data-testid={`timing-${visit.id}`}
            >
              {visitTimingLabel(visit)}
            </div>
            <div className="flex flex-col items-center">
              <span className="flex size-11 items-center justify-center rounded-full border border-app-accent/50 bg-app-accent/10 text-app-accent">
                <MapPin className="size-5" />
              </span>
              <span className="grow border-l border-dotted border-foreground/30" />
            </div>
            <div className="min-w-0 flex-1 pb-2">
              {visit.id === state.selectedId && !state.creating ? (
                editor
              ) : (
                <div className="rounded-lg border border-dashed border-foreground/30 px-4 py-3 font-semibold">
                  {routeLabel(state, visit)}
                </div>
              )}
            </div>
          </div>
          {state.creating && visit.id === state.selectedId && (
            <div className="ml-40 pb-3">{editor}</div>
          )}
          <VisitInsertion
            label={routeLabel(state, visit)}
            disabled={!canInsert}
            insert={() => insert(visit.id)}
          />
        </Fragment>
      ))}
      {!state.visits.length && editor}
    </div>
  );
}

function VisitInsertion({
  label,
  disabled,
  insert,
}: {
  label: string;
  disabled: boolean;
  insert: () => void;
}) {
  return (
    <div className="group flex h-12 items-center pl-40">
      <div className="flex w-full items-center">
        <span className="flex-1 border-t border-dotted border-foreground/30" />
        <Button
          aria-label={`Add visit after ${label}`}
          variant="outline"
          size="icon"
          className="rounded-full opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          disabled={disabled}
          onClick={insert}
        >
          <Plus className="size-4" />
        </Button>
        <span className="flex-1 border-t border-dotted border-foreground/30" />
      </div>
    </div>
  );
}
