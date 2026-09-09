import { useState } from 'react';

import { startOfMonthISODate, startOfWeekISODate, todayISODate } from '@pops/date';

import { DateRangeField, type DateRangePreset, type DateRangeValue } from './DateRangeField';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof DateRangeField> = {
  component: DateRangeField,
  title: 'Inputs/DateRangeField',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof DateRangeField>;

export const Empty: Story = {
  render: () => {
    const [value, setValue] = useState<DateRangeValue>({ start: '', end: '' });
    return <DateRangeField value={value} onChange={setValue} />;
  },
};

export const WithValue: Story = {
  render: () => {
    const [value, setValue] = useState<DateRangeValue>({
      start: '2026-06-01',
      end: '2026-06-30',
    });
    return <DateRangeField value={value} onChange={setValue} />;
  },
};

// Boundaries come from @pops/date so "this week"/"this month" read the
// viewer's own local calendar day, not a UTC-derived one.
const WEEK_MONTH_PRESETS: DateRangePreset[] = [
  {
    label: 'This week',
    range: () => ({ start: startOfWeekISODate(), end: todayISODate() }),
  },
  {
    label: 'This month',
    range: () => ({ start: startOfMonthISODate(), end: todayISODate() }),
  },
];

export const WithPresets: Story = {
  render: () => {
    const [value, setValue] = useState<DateRangeValue>({ start: '', end: '' });
    return <DateRangeField value={value} onChange={setValue} presets={WEEK_MONTH_PRESETS} />;
  },
};

function yearPreset(year: number): DateRangePreset {
  return {
    label: String(year),
    range: () => ({ start: `${year}-01-01`, end: `${year}-12-31` }),
  };
}

export const WithYearPresets: Story = {
  render: () => {
    const [value, setValue] = useState<DateRangeValue>({ start: '', end: '' });
    const years = [2026, 2025, 2024].map(yearPreset);
    return <DateRangeField value={value} onChange={setValue} presets={years} />;
  },
};

export const Disabled: Story = {
  render: () => (
    <DateRangeField
      value={{ start: '2026-06-01', end: '2026-06-30' }}
      onChange={() => {}}
      disabled
    />
  ),
};

export const CustomLabels: Story = {
  render: () => {
    const [value, setValue] = useState<DateRangeValue>({ start: '', end: '' });
    return (
      <DateRangeField
        value={value}
        onChange={setValue}
        startLabel="From"
        endLabel="To"
        clearLabel="Reset"
      />
    );
  },
};
