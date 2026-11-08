import { formatCityTiming, presentTripRecord } from '@/fixtures/trip-overview-format';
import { isPurchasedArrangement } from '@/fixtures/trip-overview-model';
import { MapPin } from 'lucide-react';

import { Badge, TextInput, cn } from '@pops/ui';

import { canvasName } from '../trip-route-editing/canvas-model';
import { isTripDate } from '../trip-route-editing/lodging-periods';

import type { TripRecord } from '@/fixtures/trip-overview-model';

import type { CanvasState } from '../trip-route-editing/canvas-model';

/** Compact source timeline exposes optional visit dates without rewriting linked purchases. */
export function AlternativeTimeline({
  canvas,
  visits,
  editableIds,
  change,
}: {
  canvas: CanvasState;
  visits: TripRecord[];
  editableIds?: string[];
  change?: (canvas: CanvasState) => void;
}) {
  return (
    <div>
      {visits.map((visit) => (
        <div key={visit.id} className="flex gap-5">
          <aside className="relative w-24 shrink-0 border-r-2 border-dotted border-app-accent/50 py-3 pr-5 text-right text-xs font-medium text-foreground/90 sm:w-28">
            {formatCityTiming(visit.timing ?? {})}
            <span className="absolute -right-4 top-3 flex size-8 items-center justify-center rounded-full bg-app-accent text-app-accent-foreground">
              <MapPin className="size-4" aria-hidden />
            </span>
          </aside>
          <div className="min-w-0 flex-1 space-y-1 py-2">
            <h3 className="py-1 text-base font-semibold">{canvasName(canvas, visit)}</h3>
            {visit.notes && <p className="text-sm text-foreground/75">{visit.notes}</p>}
            {editableIds?.includes(visit.id) && change && (
              <VisitDates canvas={canvas} visit={visit} change={change} />
            )}
            {canvas.records
              .filter(
                (record) =>
                  record.visitId === visit.id && ['stay', 'event', 'person'].includes(record.kind)
              )
              .map((record) => (
                <div
                  key={record.id}
                  className={cn(
                    'flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-dashed border-foreground/20 px-2 py-2 text-sm',
                    isPurchasedArrangement(record) &&
                      'border-solid border-l-4 border-l-app-accent bg-background/50'
                  )}
                >
                  <span>{canvasName(canvas, record)}</span>
                  <span className="text-xs text-foreground/75">
                    {presentTripRecord(record, canvas.records).when}
                  </span>
                  {isPurchasedArrangement(record) && <Badge variant="secondary">Purchased</Badge>}
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function VisitDates({
  canvas,
  visit,
  change,
}: {
  canvas: CanvasState;
  visit: TripRecord;
  change: (canvas: CanvasState) => void;
}) {
  function update(field: 'arrival' | 'departure', value: string) {
    if (value && !isTripDate(value)) return;
    change({
      ...canvas,
      records: canvas.records.map((record) =>
        record.id === visit.id
          ? {
              ...record,
              timing: { ...record.timing, [field]: isTripDate(value) ? value : undefined },
            }
          : record
      ),
    });
  }
  return (
    <div className="flex flex-wrap gap-2">
      {(['arrival', 'departure'] as const).map((field) => (
        <TextInput
          key={field}
          type="date"
          label={field === 'arrival' ? 'Arrival' : 'Departure'}
          aria-label={`${canvasName(canvas, visit)} ${field}`}
          value={visit.timing?.[field] ?? ''}
          onChange={(event) => update(field, event.target.value)}
          containerClassName="bg-background/40"
        />
      ))}
    </div>
  );
}
