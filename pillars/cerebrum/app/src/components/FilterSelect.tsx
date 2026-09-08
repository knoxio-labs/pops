/**
 * FilterSelect - kit-`Select`-backed dropdown for list/panel filters.
 *
 * Models "all" as a normal, re-selectable option (value `''`) rather than
 * kit `Select`'s `placeholder` prop. `placeholder` renders a disabled
 * option, which a user could never pick again once they chose a real
 * filter value - that would silently remove the ability to clear a filter.
 */
import { Select, type SelectOption } from '@pops/ui';

import { TOUCH_TARGET_MIN_HEIGHT } from '../utils/touchTarget';

export interface FilterSelectProps<T extends string> {
  label: string;
  value: T | null;
  options: readonly T[];
  emptyLabel: string;
  onChange: (next: T | null) => void;
}

export function FilterSelect<T extends string>({
  label,
  value,
  options,
  emptyLabel,
  onChange,
}: FilterSelectProps<T>) {
  const selectOptions: SelectOption[] = [
    { value: '', label: emptyLabel },
    ...options.map((opt) => ({ value: opt, label: opt })),
  ];

  return (
    <Select
      label={label}
      aria-label={label}
      className={TOUCH_TARGET_MIN_HEIGHT}
      value={value ?? ''}
      options={selectOptions}
      onChange={(e) => onChange((e.target.value === '' ? null : e.target.value) as T | null)}
    />
  );
}
