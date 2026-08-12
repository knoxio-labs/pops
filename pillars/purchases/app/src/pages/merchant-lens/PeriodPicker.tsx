import { useTranslation } from 'react-i18next';

import { Select } from '@pops/ui';

import { ALL_TIME, periodYears, type PeriodSelection } from './period.js';

import type { ReactElement } from 'react';

interface Props {
  value: PeriodSelection;
  onChange: (next: PeriodSelection) => void;
  now: Date;
}

export function PeriodPicker({ value, onChange, now }: Props): ReactElement {
  const { t } = useTranslation('purchases');

  const options = [
    { value: ALL_TIME, label: t('merchants.period.allTime') },
    ...periodYears(now).map((year) => ({ value: year, label: year })),
  ];

  return (
    <div className="max-w-xs">
      <Select
        label={t('merchants.period.label')}
        options={options}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
