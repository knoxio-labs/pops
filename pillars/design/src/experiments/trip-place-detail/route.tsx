import { Lightbulb, MapPin } from 'lucide-react';

import { useIdea } from './context';
import { visitDates } from './display';
import { IdeaEditor } from './editor';
import { ideaTimingLabel } from './model';

import type { ReactNode } from 'react';

/** Show source visits in their stored route order; placement is an explicit reference, never inferred. */
export function IdeaRoute({ includeEditor }: { includeEditor: boolean }) {
  const { state } = useIdea();
  const placed = state.visits.some((visit) => visit.id === state.visitId);
  return (
    <div className="space-y-4">
      {includeEditor && !placed && (
        <IdeaRail label={ideaTimingLabel(state)} idea>
          <IdeaEditor />
        </IdeaRail>
      )}
      <section aria-label="Route context" className="space-y-3">
        {state.visits.map((visit) => (
          <IdeaRail key={visit.id} label={visitDates(visit)}>
            <div className="space-y-2">
              <h2 className="text-base font-semibold">
                {state.cities.find((city) => city.id === visit.cityId)?.name ?? 'City unavailable'}
              </h2>
              {includeEditor && visit.id === state.visitId ? (
                <IdeaEditor />
              ) : (
                <div className="border-b border-dotted border-foreground/25" />
              )}
            </div>
          </IdeaRail>
        ))}
      </section>
    </div>
  );
}

/** A compact date rail with an icon marker shares the route's hierarchy without adding prose. */
export function IdeaRail({
  label,
  idea = false,
  children,
}: {
  label: string;
  idea?: boolean;
  children: ReactNode;
}) {
  const Icon = idea ? Lightbulb : MapPin;
  return (
    <div className="flex gap-3">
      <div className="w-20 shrink-0 pt-2 text-right text-xs font-medium sm:w-28">{label}</div>
      <div className="flex shrink-0 flex-col items-center">
        <span className="flex size-9 items-center justify-center rounded-full border border-app-accent/40 bg-app-accent/20 text-app-accent">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="grow border-l border-dotted border-app-accent/50" />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
