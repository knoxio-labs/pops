import { Textarea, TextInput } from '@pops/ui';

import { useJourney } from './context';

/** Explicit user buffers feed findings; no airport policy or travel estimate is inferred. */
export function JourneySettings() {
  const { state, change } = useJourney();
  return (
    <details>
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
        References and timing
      </summary>
      <div className="space-y-3 rounded-xl border border-foreground/25 bg-muted/40 p-3">
        <TextInput
          label="Journey reference"
          variant="ghost"
          containerClassName="bg-transparent"
          key={state.reference}
          defaultValue={state.reference}
          onBlur={(event) => {
            if (event.currentTarget.value !== state.reference)
              change({ ...state, reference: event.currentTarget.value });
          }}
        />
        <JourneyBuffers />
        <Textarea
          aria-label="Journey notes"
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

function JourneyBuffers() {
  const { state, change } = useJourney();
  return (
    <div className="flex flex-wrap gap-3">
      {(
        [
          ['minimumConnectionMinutes', 'Connection minimum · min'],
          ['airportBufferMinutes', 'Before airport departure · min'],
        ] as const
      ).map(([field, label]) => (
        <TextInput
          key={`${field}-${state[field]}`}
          type="number"
          min={0}
          label={label}
          defaultValue={state[field]}
          onBlur={(event) => {
            const value = event.currentTarget.valueAsNumber;
            if (Number.isFinite(value) && value >= 0 && value !== state[field])
              change({ ...state, [field]: value });
          }}
        />
      ))}
    </div>
  );
}
