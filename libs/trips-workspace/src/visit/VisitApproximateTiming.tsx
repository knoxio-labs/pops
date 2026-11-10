import { useState } from 'react';

import { Select, TextInput } from '@pops/ui';

import { durationValue } from './approximate';
import { VisitMonthFields } from './VisitMonthFields';

import type { JSX } from 'react';

import type { VisitFieldProps } from './VisitFields';

/** Approximate source facts have no implicit month, unit or duration bounds. */
export function VisitApproximateTiming(props: VisitFieldProps): JSX.Element {
  return (
    <details open={Boolean(props.visit.timing.month ?? props.visit.timing.duration)}>
      <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">
        Approximate timing
      </summary>
      <div className="space-y-3">
        <VisitMonthFields key={JSON.stringify(props.visit.timing.month)} {...props} />
        <DurationFields key={JSON.stringify(props.visit.timing.duration)} {...props} />
      </div>
    </details>
  );
}
function DurationFields({ visit, commit }: VisitFieldProps): JSX.Element {
  const duration = visit.timing.duration;
  const [draft, setDraft] = useState({
    min: duration?.min === undefined ? '' : String(duration.min),
    max: duration?.max === undefined ? '' : String(duration.max),
    unit: duration?.unit ?? '',
  });
  const [error, setError] = useState<string>();
  const save = (next: typeof draft): void => {
    const parsed = durationValue(next);
    setError(parsed.error);
    if (parsed.error) return;
    const timing = { ...visit.timing };
    if (parsed.value) timing.duration = parsed.value;
    else delete timing.duration;
    void commit({ timing });
  };
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {(['min', 'max'] as const).map((field) => (
          <TextInput
            key={field}
            label={field === 'min' ? 'Minimum duration' : 'Maximum duration'}
            type="number"
            min="0"
            step="any"
            value={draft[field]}
            className="min-h-11"
            onChange={(event) => setDraft({ ...draft, [field]: event.currentTarget.value })}
            onBlur={() => save(draft)}
          />
        ))}
        <div className="col-span-2 sm:col-span-1">
          <Select
            label="Duration unit"
            value={draft.unit}
            className="min-h-11"
            options={[
              { value: '', label: 'Choose unit' },
              { value: 'days', label: 'Days' },
              { value: 'weeks', label: 'Weeks' },
            ]}
            onChange={(event) => {
              const next = { ...draft, unit: event.currentTarget.value };
              setDraft(next);
              save(next);
            }}
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
