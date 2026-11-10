import type { Visit } from './types';

/** Raw optional duration capture; blank remains absent rather than zero. */
export interface DurationDraft {
  min: string;
  max: string;
  unit: string;
}
/** Parse only explicit valid duration facts; an empty capture clears the optional value. */
export function durationValue(draft: DurationDraft): {
  value: Visit['timing']['duration'];
  error?: string;
} {
  if (!draft.min && !draft.max) return { value: undefined };
  const min = optionalNumber(draft.min);
  const max = optionalNumber(draft.max);
  if ([min, max].some((value) => value !== undefined && (!Number.isFinite(value) || value < 0)))
    return { value: undefined, error: 'Duration must be a finite non-negative number.' };
  if (min !== undefined && max !== undefined && max < min)
    return { value: undefined, error: 'Maximum duration must not precede minimum.' };
  if (draft.unit !== 'days' && draft.unit !== 'weeks')
    return { value: undefined, error: 'Choose a duration unit.' };
  return {
    value: {
      ...(min === undefined ? {} : { min }),
      ...(max === undefined ? {} : { max }),
      unit: draft.unit,
    },
  };
}
/** Raw approximate month facts; year and month are captured without synthesizing either. */
export interface MonthDraft {
  year: string;
  month: string;
  part: string;
}
/** Parse optional approximate timing; an empty year and month clear the source month. */
export function monthValue(draft: MonthDraft): { value: Visit['timing']['month']; error?: string } {
  if (!draft.year && !draft.month) return { value: undefined };
  const year = Number(draft.year);
  const month = Number(draft.month);
  if (!completeMonth(draft, year, month))
    return { value: undefined, error: 'Enter an integer year and a month from 1 to 12.' };
  const part = draft.part;
  if (part !== '' && part !== 'early' && part !== 'middle' && part !== 'late')
    return { value: undefined, error: 'Choose an available part of month.' };
  return { value: { year, month, ...(part === '' ? {} : { part }) } };
}

function optionalNumber(value: string): number | undefined {
  if (value === '') return undefined;
  return value.trim() === '' ? Number.NaN : Number(value);
}
function completeMonth(draft: MonthDraft, year: number, month: number): boolean {
  return (
    draft.year.trim() !== '' &&
    draft.month.trim() !== '' &&
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12
  );
}
