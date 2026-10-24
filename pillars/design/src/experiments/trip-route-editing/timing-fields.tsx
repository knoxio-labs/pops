import { Select, TextInput } from '@pops/ui';

import type { TripCityTiming, TripDate, TripMonth } from '@/fixtures/trip-overview-model';

function isCalendarDate(value: string): value is TripDate {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function calendarDate(value: string): TripDate | undefined {
  return isCalendarDate(value) ? value : undefined;
}

function calendarMonth(value: string): TripMonth | undefined {
  const [year = NaN, month = NaN] = value.split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12)
    return undefined;
  const months: TripMonth['month'][] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const selected = months.find((candidate) => candidate === month);
  return selected ? { year, month: selected } : undefined;
}

/** Timing precision is chosen explicitly; unknown dates need no text entry. */
export function TimingFields({
  timing,
  onChange,
}: {
  timing: TripCityTiming;
  onChange: (timing: TripCityTiming) => void;
}) {
  const mode = timing.month ? 'month' : 'dates';
  return (
    <div className="space-y-4">
      <Select
        label="Timing"
        value={mode}
        options={[
          { value: 'dates', label: 'Dates' },
          { value: 'month', label: 'Around a month' },
        ]}
        onChange={(e) =>
          onChange(e.target.value === 'month' ? { month: { year: 2028, month: 1 } } : {})
        }
      />
      {mode === 'dates' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Arrival"
            className="min-w-0 w-full"
            type="date"
            defaultValue={timing.arrival ?? ''}
            onInput={(e) => onChange({ ...timing, arrival: calendarDate(e.currentTarget.value) })}
          />
          <TextInput
            label="Departure"
            className="min-w-0 w-full"
            type="date"
            defaultValue={timing.departure ?? ''}
            onInput={(e) => onChange({ ...timing, departure: calendarDate(e.currentTarget.value) })}
          />
        </div>
      ) : (
        <ApproximateFields timing={timing} onChange={onChange} />
      )}
    </div>
  );
}

function ApproximateFields({
  timing,
  onChange,
}: {
  timing: TripCityTiming;
  onChange: (timing: TripCityTiming) => void;
}) {
  const month = timing.month;
  return (
    <div className="space-y-4">
      <TextInput
        label="Month"
        className="min-w-0 w-full"
        type="month"
        value={month ? `${month.year}-${String(month.month).padStart(2, '0')}` : ''}
        onInput={(e) => onChange({ ...timing, month: calendarMonth(e.currentTarget.value) })}
      />
      <Select
        label="Part of month"
        value={month?.part ?? ''}
        options={[
          { value: '', label: 'Any' },
          { value: 'early', label: 'Early' },
          { value: 'middle', label: 'Middle' },
          { value: 'late', label: 'Late' },
        ]}
        onChange={(e) => {
          const part = e.target.value;
          if (month && (part === 'early' || part === 'middle' || part === 'late' || part === ''))
            onChange({ ...timing, month: { ...month, part: part || undefined } });
        }}
      />
      <DurationFields timing={timing} onChange={onChange} />
    </div>
  );
}

function DurationFields({
  timing,
  onChange,
}: {
  timing: TripCityTiming;
  onChange: (timing: TripCityTiming) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <TextInput
        label="Minimum weeks"
        type="number"
        min={1}
        value={timing.duration?.min ?? ''}
        onChange={(e) => {
          const min = Number(e.target.value);
          onChange({
            ...timing,
            duration:
              min > 0
                ? { min, max: Math.max(min, timing.duration?.max ?? min), unit: 'weeks' }
                : undefined,
          });
        }}
      />
      <TextInput
        label="Maximum weeks"
        type="number"
        min={timing.duration?.min ?? 1}
        value={timing.duration?.max ?? ''}
        onChange={(e) => {
          const max = Number(e.target.value);
          onChange({
            ...timing,
            duration:
              max > 0 ? { min: timing.duration?.min ?? max, max, unit: 'weeks' } : undefined,
          });
        }}
      />
    </div>
  );
}
