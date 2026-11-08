import { tripDisplayName, tripMetadata } from '@/fixtures/trip-metadata';
import { ArrowLeft, CalendarDays, CircleHelp, RotateCcw, TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';

import { Badge, Button, Popover, PopoverContent, PopoverTrigger, TextInput } from '@pops/ui';

import { useRouteState } from '../trip-route-editing/canvas-state';
import { DecisionContext, useDecision } from './context';
import { DecisionText } from './fields';
import { initialDecision } from './fixture';
import { decisionDeadlineLabel, decisionFindings, reopenDecision } from './model';
import { DecisionOptions } from './options';
import { DecisionReview } from './review';
import { DecisionImpact } from './sources';

import type { DecisionScenario } from './fixture';

/** Compare choices using the same source snapshot, selection rules and undo history. */
export function DecisionWorkspace({
  layout,
  scenario = 'default',
}: {
  layout: 'options' | 'impact';
  scenario?: DecisionScenario;
}) {
  const history = useRouteState(() => initialDecision(scenario));
  const value = useMemo(
    () => ({ state: history.state, change: history.change }),
    [history.state, history.change]
  );
  return (
    <DecisionContext.Provider value={value}>
      <DecisionReview layout={layout} />
      <main className="mx-auto max-w-4xl space-y-5 p-4 md:p-6">
        <header className="flex items-center justify-between">
          <Button asChild variant="ghost">
            <a target="_top" href="/design/x/trip-route-editing/direct/s/trips/route">
              <ArrowLeft className="size-4" aria-hidden />
              {tripDisplayName(tripMetadata)}
            </a>
          </Button>
          <Button variant="ghost" disabled={!history.canUndo} onClick={history.undo}>
            <RotateCcw className="size-4" aria-hidden />
            Undo
          </Button>
        </header>
        <DecisionHeader />
        <DecisionIssues />
        {layout === 'impact' && <DecisionImpact />}
        <DecisionOptions />
        {layout === 'options' && (
          <details>
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
              Affected plans
            </summary>
            <DecisionImpact />
          </details>
        )}
        <details>
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Notes</summary>
          <DecisionText
            multiline
            value={history.state.notes}
            label="Decision notes"
            onCommit={(notes) => history.change({ ...history.state, notes })}
          />
        </details>
      </main>
    </DecisionContext.Provider>
  );
}

function DecisionHeader() {
  const { state, change } = useDecision();
  const selected = state.options.find((option) => option.id === state.selectedOptionId);
  return (
    <section
      aria-label="Decision"
      className="rounded-xl border border-foreground/30 bg-muted/60 p-4 shadow-sm"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <CircleHelp className="size-5 text-app-accent" aria-hidden />
          Decision
        </h1>
        <Badge variant="outline" className={selected ? 'border-app-accent text-app-accent' : ''}>
          {selected ? 'Decided' : 'Open'}
        </Badge>
      </div>
      <DecisionText
        heading
        value={state.question}
        label="Question"
        onCommit={(question) => change({ ...state, question })}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" aria-label="Edit deadline">
              <CalendarDays className="size-4 text-app-accent" aria-hidden />
              {decisionDeadlineLabel(state) || 'Add deadline'}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 space-y-2">
            <TextInput
              label="Decide by"
              type="date"
              value={state.deadline}
              onChange={(event) => change({ ...state, deadline: event.currentTarget.value })}
            />
            {state.deadline && (
              <Button variant="ghost" onClick={() => change({ ...state, deadline: '' })}>
                Remove deadline
              </Button>
            )}
          </PopoverContent>
        </Popover>
        {state.selectedOptionId && (
          <Button variant="outline" onClick={() => change(reopenDecision(state))}>
            <RotateCcw className="size-4" aria-hidden />
            Reopen
          </Button>
        )}
      </div>
    </section>
  );
}

function DecisionIssues() {
  const { state } = useDecision();
  const findings = decisionFindings(state);
  if (!findings.length) return null;
  return (
    <section aria-label="Decision issues" className="space-y-2">
      {findings.map((finding) => (
        <div
          key={finding.id}
          className="flex gap-2 rounded-lg border border-destructive bg-destructive/10 p-3 text-sm"
        >
          <TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden />
          <div>
            <p className="font-medium">{finding.title}</p>
            <p className="text-muted-foreground">{finding.detail}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
