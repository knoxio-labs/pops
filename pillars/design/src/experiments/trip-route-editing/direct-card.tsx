import { tripPlaceName } from '@/fixtures/trip-places';
import { GripVertical, Trash2 } from 'lucide-react';

import { Badge, Button } from '@pops/ui';

import { DirectFields } from './direct-fields';
import { DirectItems, tripItemDragType } from './direct-items';
import { InsertVisit } from './insert';

import type { TripRecord } from '@/fixtures/trip-overview-model';

import type { PlannerState } from './model';

interface DirectCardProps {
  record: TripRecord;
  state: PlannerState;
  index: number;
  onEdit: (record: TripRecord) => void;
  onAssign: (id: string) => void;
  onAdd: (placeId: string) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
}

/** A route node accepts direct edits, arrangement drops and a one-step nested visit picker. */
export function DirectCard({
  record,
  state,
  index,
  onEdit,
  onAssign,
  onAdd,
  onRemove,
  onMove,
}: DirectCardProps) {
  return (
    <article
      aria-label={tripPlaceName(record.placeId)}
      className="group space-y-3 rounded-xl border border-dashed bg-card p-3"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(tripItemDragType)) e.preventDefault();
      }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData(tripItemDragType);
        if (id) {
          e.preventDefault();
          e.stopPropagation();
          onAssign(id);
        }
      }}
    >
      <div className="flex items-start gap-1">
        {state.parents[record.id] ? (
          <Badge variant="outline">Side trip</Badge>
        ) : (
          <VisitGrip index={index} onMove={onMove} />
        )}
        <DirectFields record={record} onChange={onEdit} />
        <Button
          variant="ghost"
          className="min-h-11 min-w-11 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100"
          aria-label={`Remove ${tripPlaceName(record.placeId)}`}
          onClick={onRemove}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
      <DirectItems visit={record} records={state.records} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span />
        <InsertVisit
          subtle
          label={`Add side trip to ${tripPlaceName(record.placeId)}`}
          onAdd={onAdd}
        />
      </div>
    </article>
  );
}

function VisitGrip({ index, onMove }: { index: number; onMove: (delta: number) => void }) {
  return (
    <Button
      draggable
      variant="ghost"
      className="min-h-11 min-w-11 cursor-grab px-2 active:cursor-grabbing"
      aria-label={`Drag visit ${index + 1}`}
      title="Drag visit · Alt + arrow keys"
      onKeyDown={(e) => {
        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault();
          onMove(e.key === 'ArrowUp' ? -1 : 1);
        }
      }}
    >
      <GripVertical className="size-4" aria-hidden />
      <span className="text-xs text-muted-foreground">{index + 1}</span>
    </Button>
  );
}
