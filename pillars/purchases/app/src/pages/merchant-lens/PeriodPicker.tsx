import { useTranslation } from 'react-i18next';

import { Select } from '@pops/ui';

import { ALL_TIME, parsePeriodSelection, periodYears, type PeriodSelection } from './period.js';

import type { ReactElement } from 'react';

interface Props {
  value: PeriodSelection;
  onChange: (next: PeriodSelection) => void;
  now: Date;
}

export function PeriodPicker({ value, onChange, now }: Props): ReactElement {
  const { t } = useTranslation('purchases');
  const label = t('merchants.period.label');

  const options = [
    { value: ALL_TIME, label: t('merchants.period.allTime') },
    ...periodYears(now).map((year) => ({ value: year, label: year })),
  ];

  return (
    <div className="max-w-xs">
      {/*
        `aria-label` rather than the `label` prop alone: `Select` renders its
        label as a sibling with no `htmlFor`, so the control itself has no
        accessible name and a screen reader announces a bare combobox.
      */}
      <Select
        label={label}
        aria-label={label}
        options={options}
        value={value}
        onChange={(event) => onChange(parsePeriodSelection(event.target.value))}
      />
    </div>
  );
}
