import { CalendarDays } from 'lucide-react';

import { ComboboxSelect, TextInput, Textarea } from '@pops/ui';

import { useVisitEditor } from './context';

const parts = [
  { value: '', label: 'Any part' },
  { value: 'early', label: 'Early' },
  { value: 'middle', label: 'Middle' },
  { value: 'late', label: 'Late' },
] as const;
const units = [
  { value: 'days', label: 'Days' },
  { value: 'weeks', label: 'Weeks' },
] as const;

/** Date bounds belong to the visit and remain independent of accommodation nights. */
export function VisitDates() {
  const { state, update } = useVisitEditor();
  return (
    <section className="space-y-3 border-t pt-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <CalendarDays className="size-4 text-app-accent" aria-hidden />
        Visit dates
      </h2>
      <div className="flex flex-wrap gap-3">
        {(['arrival', 'departure'] as const).map((field) => (
          <div key={field} className="min-w-0 flex-1 basis-48">
            <TextInput
              label={field === 'arrival' ? 'Arrival' : 'Departure'}
              type="date"
              value={state.draft[field]}
              onChange={(event) => update({ ...state.draft, [field]: event.currentTarget.value })}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

/** Structured approximate timing stays optional and never supplies exact date bounds. */
export function ApproximateTiming() {
  const { state, update } = useVisitEditor();
  return (
    <details
      open={Boolean(state.draft.month || state.draft.durationMin || state.draft.durationMax)}
      className="border-t"
    >
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">
        Approximate timing
      </summary>
      <div className="space-y-3 pb-2">
        <TextInput
          label="Month"
          type="month"
          value={state.draft.month}
          onChange={(event) => update({ ...state.draft, month: event.currentTarget.value })}
        />
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Part of month</p>
          <ComboboxSelect
            aria-label="Part of month"
            value={state.draft.part}
            options={parts.map((item) => ({ ...item }))}
            placeholder="Any part"
            onChange={(value) => {
              const part = parts.find((item) => item.value === value);
              if (part) update({ ...state.draft, part: part.value });
            }}
          />
        </div>
        <div className="flex flex-wrap gap-3">
          {(['durationMin', 'durationMax'] as const).map((field) => (
            <div key={field} className="min-w-0 flex-1 basis-40">
              <TextInput
                label={field === 'durationMin' ? 'Minimum duration' : 'Maximum duration'}
                type="number"
                min={0}
                step="any"
                value={state.draft[field]}
                onChange={(event) => update({ ...state.draft, [field]: event.currentTarget.value })}
              />
            </div>
          ))}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Unit</p>
            <ComboboxSelect
              aria-label="Duration unit"
              value={state.draft.durationUnit}
              options={units.map((item) => ({ ...item }))}
              onChange={(value) => {
                const unit = units.find((item) => item.value === value);
                if (unit) update({ ...state.draft, durationUnit: unit.value });
              }}
            />
          </div>
        </div>
      </div>
    </details>
  );
}

/** Notes are stored user text, with no generated description. */
export function VisitNotes() {
  const { state, update } = useVisitEditor();
  return (
    <details className="border-t">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Notes</summary>
      <Textarea
        aria-label="Visit notes"
        value={state.draft.notes}
        onChange={(event) => update({ ...state.draft, notes: event.currentTarget.value })}
      />
    </details>
  );
}
