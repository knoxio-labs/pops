import type { Visit } from '../stay/types';

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
    return { value: undefined, error: 'durationNumber' };
  if (min !== undefined && max !== undefined && max < min)
    return { value: undefined, error: 'durationOrder' };
  if (draft.unit !== 'days' && draft.unit !== 'weeks')
    return { value: undefined, error: 'durationUnit' };
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
  if (!completeMonth(draft, year, month)) return { value: undefined, error: 'monthInvalid' };
  const part = draft.part;
  if (part !== '' && part !== 'early' && part !== 'middle' && part !== 'late')
    return { value: undefined, error: 'partInvalid' };
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
