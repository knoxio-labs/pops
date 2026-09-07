import { Select } from '@pops/ui';

import { ALL_TIME, parsePeriodSelection, periodYears } from './period';

import type { PeriodSelection } from './period';

/** The all-time-or-a-year picker that scopes the merchant lens. */
export function PeriodPicker({
  value,
  onChange,
  now,
}: {
  value: PeriodSelection;
  onChange: (next: PeriodSelection) => void;
  now: Date;
}) {
  const options = [
    { value: ALL_TIME, label: 'All time' },
    ...periodYears(now).map((year) => ({ value: year, label: year })),
  ];

  return (
    <div className="max-w-xs">
      <Select
        label="Period"
        options={options}
        value={value}
        onChange={(event) => onChange(parsePeriodSelection(event.target.value))}
      />
    </div>
  );
}
