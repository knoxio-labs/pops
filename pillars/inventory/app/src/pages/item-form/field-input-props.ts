import type { FormFieldKind } from './field-model';

interface FieldInputProps {
  readonly type: 'text' | 'number' | 'date' | 'datetime-local' | 'url';
  readonly step?: number | 'any';
}

/** Matches native input constraints to the stored and override value contracts. */
export function fieldInputProps(kind: FormFieldKind): FieldInputProps {
  if (kind === 'integer') return { type: 'number', step: 1 };
  if (kind === 'decimal' || kind === 'measurement') return { type: 'number', step: 'any' };
  if (kind === 'date') return { type: 'date' };
  if (kind === 'date_time') return { type: 'datetime-local', step: 0.001 };
  if (kind === 'url') return { type: 'url' };
  return { type: 'text' };
}

/** Displays saved instants in local time without discarding their offset in the draft. */
export function fieldInputValue(kind: FormFieldKind, value: string): string {
  if (kind !== 'date_time' || !value.endsWith('Z')) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const year = String(parsed.getFullYear()).padStart(4, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const hour = String(parsed.getHours()).padStart(2, '0');
  const minute = String(parsed.getMinutes()).padStart(2, '0');
  const second = String(parsed.getSeconds()).padStart(2, '0');
  const millisecond = String(parsed.getMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${millisecond}`;
}
