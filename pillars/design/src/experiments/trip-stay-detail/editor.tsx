import { MapPin } from 'lucide-react';

import { Badge, Textarea, cn } from '@pops/ui';

import { useStay } from './context';
import { StayDocuments } from './documents';
import { StayField } from './fields';
import { StayHost } from './host';
import { stayFindings, stayNights } from './model';
import { StaySelectors } from './selectors';

/** Compact accommodation facts: stay nights and check-in clocks are distinct stored fields. */
export function StayEditor() {
  const { state } = useStay();
  const conflict = stayFindings(state).some((finding) => finding.kind === 'conflict');
  const nights = stayNights(state);
  return (
    <article
      aria-label="Stay editor"
      className={cn(
        'space-y-3 rounded-xl border border-foreground/30 bg-muted/40 p-4 shadow-sm',
        state.status === 'Purchased' ? 'border-l-4 border-l-app-accent' : 'border-dashed',
        conflict && 'border-destructive'
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0 flex-1">
          <StayField field="name" label="Stay name" />
        </div>
        {nights !== undefined && (
          <Badge variant="outline">
            {nights} {nights === 1 ? 'night' : 'nights'}
          </Badge>
        )}
      </div>
      <StaySelectors />
      <div className="flex flex-wrap gap-3">
        <div className="w-44">
          <StayField field="from" label="Check-in date" type="date" />
        </div>
        <div className="w-36">
          <StayField field="checkIn" label="Check-in time" type="time" />
        </div>
        <div className="w-44">
          <StayField field="to" label="Check-out date" type="date" />
        </div>
        <div className="w-36">
          <StayField field="checkOut" label="Check-out time" type="time" />
        </div>
      </div>
      <div className="max-w-72">
        <StayField field="timeZone" label="Time zone" />
      </div>
      <div className="flex items-center gap-2 border-t pt-2">
        <MapPin className="size-4 shrink-0 text-app-accent" aria-hidden />
        <div className="flex-1">
          <StayField field="address" label="Address" />
        </div>
      </div>
      <StayHost />
      <StayDocuments />
      <StayNotes />
    </article>
  );
}

function StayNotes() {
  const { state, change } = useStay();
  return (
    <details>
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
        Reference and notes
      </summary>
      <div className="space-y-2">
        <StayField field="reference" label="Booking reference" />
        <Textarea
          aria-label="Stay notes"
          placeholder="Add note"
          key={state.notes}
          defaultValue={state.notes}
          onBlur={(event) => {
            if (event.currentTarget.value !== state.notes)
              change({ ...state, notes: event.currentTarget.value });
          }}
        />
      </div>
    </details>
  );
}
