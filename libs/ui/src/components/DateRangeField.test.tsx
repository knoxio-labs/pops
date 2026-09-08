import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startOfMonthISODate, startOfWeekISODate } from '@pops/date';

import { DateRangeField, type DateRangePreset, type DateRangeValue } from './DateRangeField';

function ControlledField(props: { presets?: DateRangePreset[]; initial?: DateRangeValue }) {
  const [value, setValue] = useState<DateRangeValue>(props.initial ?? { start: '', end: '' });
  return <DateRangeField value={value} onChange={setValue} presets={props.presets} />;
}

describe('DateRangeField — ordering', () => {
  it('pulls end forward when start is moved past it', () => {
    const onChange = vi.fn();
    render(
      <DateRangeField value={{ start: '2026-03-05', end: '2026-03-10' }} onChange={onChange} />
    );

    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2026-03-15' } });

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ start: '2026-03-15', end: '2026-03-15' });
  });

  it('leaves end untouched when start still precedes it', () => {
    const onChange = vi.fn();
    render(
      <DateRangeField value={{ start: '2026-03-05', end: '2026-03-20' }} onChange={onChange} />
    );

    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2026-03-10' } });

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ start: '2026-03-10', end: '2026-03-20' });
  });

  it('never lets end land before start, end-first', () => {
    const onChange = vi.fn();
    render(
      <DateRangeField value={{ start: '2026-03-10', end: '2026-03-20' }} onChange={onChange} />
    );

    fireEvent.change(screen.getByLabelText('End'), { target: { value: '2026-03-01' } });

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ start: '2026-03-10', end: '2026-03-10' });
  });

  it('leaves a valid end-first change untouched', () => {
    const onChange = vi.fn();
    render(
      <DateRangeField value={{ start: '2026-03-05', end: '2026-03-20' }} onChange={onChange} />
    );

    fireEvent.change(screen.getByLabelText('End'), { target: { value: '2026-03-25' } });

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ start: '2026-03-05', end: '2026-03-25' });
  });

  it('keeps the range valid across a full interaction (integration)', () => {
    render(<ControlledField initial={{ start: '2026-03-05', end: '2026-03-10' }} />);

    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2026-03-20' } });

    expect(screen.getByLabelText<HTMLInputElement>('Start').value).toBe('2026-03-20');
    expect(screen.getByLabelText<HTMLInputElement>('End').value).toBe('2026-03-20');
  });
});

describe('DateRangeField — clear', () => {
  it('has no clear control when the range is empty', () => {
    render(<DateRangeField value={{ start: '', end: '' }} onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
  });

  it('empties both bounds', async () => {
    render(<ControlledField initial={{ start: '2026-03-05', end: '2026-03-20' }} />);

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByLabelText<HTMLInputElement>('Start').value).toBe('');
    expect(screen.getByLabelText<HTMLInputElement>('End').value).toBe('');
  });

  it('reports the clear via onChange rather than only a local reset', async () => {
    const onChange = vi.fn();
    render(
      <DateRangeField value={{ start: '2026-03-05', end: '2026-03-20' }} onChange={onChange} />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ start: '', end: '' });
  });
});

describe('DateRangeField — presets', () => {
  let originalTz: string | undefined;

  beforeEach(() => {
    originalTz = process.env['TZ'];
    // West of UTC, so the hours before local midnight (still after UTC
    // midnight) are the case a UTC-derived boundary gets wrong — the
    // regression this test exists to catch.
    process.env['TZ'] = 'Pacific/Honolulu';
    vi.useFakeTimers();
    // 19:00 HST on 2026-01-04 — 05:00 UTC on 2026-01-05.
    vi.setSystemTime(new Date('2026-01-05T05:00:00Z'));
  });

  afterEach(() => {
    if (originalTz === undefined) delete process.env['TZ'];
    else process.env['TZ'] = originalTz;
    vi.useRealTimers();
  });

  it('is running at the intended offset, or nothing below discriminates', () => {
    expect(new Date().getTimezoneOffset()).toBe(600);
  });

  it('sets both bounds from a preset built on @pops/date', () => {
    const presets: DateRangePreset[] = [
      {
        label: 'This week',
        range: () => {
          const start = startOfWeekISODate();
          return { start, end: start };
        },
      },
    ];
    render(<ControlledField presets={presets} />);

    fireEvent.click(screen.getByRole('button', { name: 'This week' }));

    // The local calendar day is 2026-01-04 (Sunday), so the ISO-Monday
    // starting that week is 2025-12-29 — a UTC read of the same instant
    // would land on 2026-01-05 and pick the wrong week entirely.
    expect(screen.getByLabelText<HTMLInputElement>('Start').value).toBe('2025-12-29');
    expect(screen.getByLabelText<HTMLInputElement>('End').value).toBe('2025-12-29');
  });

  it('resolves a month preset from the local calendar month', () => {
    const presets: DateRangePreset[] = [
      {
        label: 'This month',
        range: () => ({ start: startOfMonthISODate(), end: startOfMonthISODate() }),
      },
    ];
    render(<ControlledField presets={presets} />);

    fireEvent.click(screen.getByRole('button', { name: 'This month' }));

    expect(screen.getByLabelText<HTMLInputElement>('Start').value).toBe('2026-01-01');
  });

  it('renders no preset row when none are supplied', () => {
    render(<DateRangeField value={{ start: '', end: '' }} onChange={vi.fn()} />);
    expect(screen.queryByRole('group', { name: 'Date range presets' })).not.toBeInTheDocument();
  });
});
