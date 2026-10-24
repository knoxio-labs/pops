import { tripPlaces, tripPlaceName } from '@/fixtures/trip-places';
import { useState } from 'react';

import { Button, Select } from '@pops/ui';

import { TimingFields } from './timing-fields';

import type { TripRecord } from '@/fixtures/trip-overview-model';

/** Edit a local visit draft; cancelling leaves the route untouched. */
export function VisitEditor({
  record,
  onSave,
  onCancel,
}: {
  record: TripRecord;
  onSave: (record: TripRecord) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(record);
  const timing = draft.timing ?? {};
  const reversed = Boolean(timing.arrival && timing.departure && timing.arrival > timing.departure);
  const invalidDuration = Boolean(timing.duration && timing.duration.min > timing.duration.max);
  return (
    <form
      className="space-y-5 rounded-xl border bg-card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!reversed && !invalidDuration) onSave(draft);
      }}
    >
      <h2 className="text-xl font-semibold">{tripPlaceName(record.placeId)}</h2>
      <Select
        autoFocus
        label="City / region"
        value={draft.placeId}
        options={tripPlaces
          .filter((p) => p.kind !== 'airport')
          .map((p) => ({ value: p.id, label: p.name }))}
        onChange={(e) => setDraft({ ...draft, placeId: e.target.value })}
      />
      <TimingFields timing={timing} onChange={(next) => setDraft({ ...draft, timing: next })} />
      {reversed && (
        <p role="alert" className="text-sm text-destructive">
          Departure must be on or after arrival.
        </p>
      )}
      {invalidDuration && (
        <p role="alert" className="text-sm text-destructive">
          Maximum weeks must be at least the minimum.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={reversed || invalidDuration}>
          Save visit
        </Button>
      </div>
    </form>
  );
}
