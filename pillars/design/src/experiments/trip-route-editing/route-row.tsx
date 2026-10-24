import { presentTripRecord } from '@/fixtures/trip-overview-format';
import { isPurchasedArrangement, tripItemTier } from '@/fixtures/trip-overview-model';
import { tripPlaceName } from '@/fixtures/trip-places';
import { ArrowDown, ArrowUp, Pencil, Plus } from 'lucide-react';

import { Badge, Button, cn } from '@pops/ui';

import { outsideVisit } from './constraints';

import type { TripRecord } from '@/fixtures/trip-overview-model';

import type { PlannerState } from './model';

/** Route controls move whole visits and preserve linked arrangement identities. */
export function RouteRow({
  record,
  state,
  index,
  onEdit,
  onMove,
  onAdd,
}: {
  record: TripRecord;
  state: PlannerState;
  index: number;
  onEdit: () => void;
  onMove: (delta: number) => void;
  onAdd: () => void;
}) {
  const display = presentTripRecord(record, state.records);
  const nested = Boolean(state.parents[record.id]);
  return (
    <article
      className={cn('space-y-3 rounded-xl border border-dashed bg-card p-4', nested && 'ml-6')}
      aria-label={display.title}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          className="min-h-11 flex-1 rounded-lg text-left focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onEdit}
        >
          <span className="block text-xl font-bold">{display.title}</span>
          {display.when && <span className="mt-1 block font-medium">{display.when}</span>}
        </button>
        <RowActions
          title={display.title}
          nested={nested}
          first={index === 0}
          last={index === state.order.length - 1}
          onEdit={onEdit}
          onMove={onMove}
        />
      </div>
      <VisitLinks record={record} records={state.records} />
      {nested && (
        <Badge variant="outline">
          Side trip ·{' '}
          {tripPlaceName(
            state.records.find((r) => r.id === state.parents[record.id])?.placeId ?? ''
          )}
        </Badge>
      )}
      {!nested && (
        <Button variant="ghost" onClick={onAdd}>
          <Plus className="size-4" aria-hidden />
          Add side trip
        </Button>
      )}
    </article>
  );
}

/** Paid entries use solid borders; dated intentions remain dashed even with fixed dates. */
export function VisitLinks({ record, records }: { record: TripRecord; records: TripRecord[] }) {
  const related = records.filter((r) => r.visitId === record.id);
  if (!related.length) return null;
  return (
    <ul className="space-y-2 border-t pt-3">
      {related.map((child) => {
        const display = presentTripRecord(child, records);
        const paid = isPurchasedArrangement(child);
        const outside = outsideVisit(record, child);
        return (
          <li
            key={child.id}
            className={cn(
              'rounded-lg border p-3 text-sm',
              paid ? 'border-l-4 border-l-app-accent' : 'border-dashed'
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{display.title}</span>
              <Badge variant={paid ? 'default' : 'outline'}>{tripItemTier(child)}</Badge>
            </div>
            {display.when && <p className="mt-1">{display.when}</p>}
            {outside && (
              <p className="mt-2 font-medium text-destructive" role="status">
                Outside visit dates
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function RowActions({
  title,
  nested,
  first,
  last,
  onEdit,
  onMove,
}: {
  title: string;
  nested: boolean;
  first: boolean;
  last: boolean;
  onEdit: () => void;
  onMove: (delta: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {!nested && (
        <>
          <Button
            variant="ghost"
            className="min-h-11 min-w-11"
            aria-label={`Move ${title} up`}
            disabled={first}
            onClick={() => onMove(-1)}
          >
            <ArrowUp className="size-4" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            className="min-h-11 min-w-11"
            aria-label={`Move ${title} down`}
            disabled={last}
            onClick={() => onMove(1)}
          >
            <ArrowDown className="size-4" aria-hidden />
          </Button>
        </>
      )}
      <Button
        variant="ghost"
        className="min-h-11 min-w-11"
        aria-label={`Edit ${title}`}
        onClick={onEdit}
      >
        <Pencil className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
