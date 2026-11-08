import { formatCityTiming } from '@/fixtures/trip-overview-format';
import { MapPin } from 'lucide-react';

import { useCanvas } from '../trip-route-editing/canvas-context';
import { canvasName } from '../trip-route-editing/canvas-model';

import type { TripRecord } from '@/fixtures/trip-overview-model';
import type { ReactNode } from 'react';

/** Slot the event in its actual visit or alternative segment without changing route membership. */
export function EventRouteContext({ event, children }: { event: TripRecord; children: ReactNode }) {
  const { state } = useCanvas();
  const visit = state.records.find((r) => r.id === event.visitId && r.kind === 'city');
  if (!visit) return <>{children}</>;
  const section = state.sections.find((s) => s.cards.includes(visit.id));
  const anchor = section?.gapId ?? visit.id;
  const position = state.order.indexOf(anchor);
  const before = state.order
    .slice(0, position)
    .toReversed()
    .flatMap((id) => state.records.filter((r) => r.id === id && r.kind === 'city'))[0];
  const after = state.order
    .slice(position + 1)
    .flatMap((id) => state.records.filter((r) => r.id === id && r.kind === 'city'))[0];
  return (
    <section aria-label="Event route context">
      {before && <ContextVisit visit={before} />}
      <ContextVisit visit={visit} alternative={Boolean(section)}>
        {children}
      </ContextVisit>
      {after && <ContextVisit visit={after} />}
    </section>
  );
}

function ContextVisit({
  visit,
  alternative = false,
  children,
}: {
  visit: TripRecord;
  alternative?: boolean;
  children?: ReactNode;
}) {
  const { state } = useCanvas();
  const date = formatCityTiming(visit.timing ?? {});
  return (
    <div className="flex gap-5">
      <aside className="relative w-24 shrink-0 border-r-2 border-dotted border-app-accent/50 pr-6 pt-4 text-right text-xs font-medium text-foreground/90 sm:w-28">
        {date}
        <span className="absolute -right-4 top-3 flex size-8 items-center justify-center rounded-full border border-app-accent bg-app-accent text-app-accent-foreground">
          <MapPin className="size-4" aria-hidden />
        </span>
      </aside>
      <div className="min-w-0 flex-1 py-2">
        <div className="flex min-h-11 flex-wrap items-center gap-2">
          <span
            className={children ? 'text-lg font-bold' : 'text-sm font-medium text-foreground/80'}
          >
            {canvasName(state, visit)}
          </span>
          {alternative && (
            <span className="rounded-full bg-muted px-2 py-1 text-xs text-foreground/80">
              Alternative
            </span>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
