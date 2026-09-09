/**
 * A start/end date range built on `DateInput`, so the `lang="en-AU"` locale
 * pinning (native picker display order) is inherited rather than re-derived.
 *
 * The range relationship is enforced here, not left to the native inputs'
 * `min`/`max` attributes: those steer the picker UI but don't stop a typed
 * or pasted value from crossing the boundary, so every change is clamped in
 * the change handlers as well.
 */
import { X } from 'lucide-react';
import { useId } from 'react';

import { cn } from '../lib/utils';
import { Button } from './Button';
import { DateInput, type DateInputProps } from './DateTimeInput';

export interface DateRangeValue {
  start: string;
  end: string;
}

/**
 * A named shortcut that resolves to a concrete range when picked. Callers
 * derive `range` from `@pops/date` (`startOfWeekISODate`, `startOfMonthISODate`,
 * `todayISODate`, …) so "this week"/"this month" style presets read the
 * viewer's own local calendar day rather than a UTC-derived one.
 */
export interface DateRangePreset {
  label: string;
  range: () => DateRangeValue;
}

export interface DateRangeFieldProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  /**
   * Shortcuts rendered above the inputs. Not hardcoded — the four existing
   * call sites (year buckets, week/month presets, none at all) each want a
   * different vocabulary, so the caller supplies its own list.
   */
  presets?: DateRangePreset[];
  startLabel?: string;
  endLabel?: string;
  clearLabel?: string;
  disabled?: boolean;
  className?: string;
  variant?: DateInputProps['variant'];
  size?: DateInputProps['size'];
}

// Stable reference: an inline `[]` default would be a fresh array every
// render, which defeats memoization anywhere downstream keys off `presets`.
const NO_PRESETS: DateRangePreset[] = [];

function PresetsRow({
  presets,
  disabled,
  onPick,
}: {
  presets: DateRangePreset[];
  disabled: boolean;
  onPick: (preset: DateRangePreset) => void;
}) {
  if (presets.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Date range presets">
      {presets.map((preset) => (
        <Button
          key={preset.label}
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            onPick(preset);
          }}
        >
          {preset.label}
        </Button>
      ))}
    </div>
  );
}

function BoundInput({
  id,
  label,
  inputProps,
}: {
  id: string;
  label: string;
  inputProps: DateInputProps;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-muted-foreground">
        {label}
      </label>
      <DateInput id={id} {...inputProps} />
    </div>
  );
}

/**
 * Clamps a start/end pair so end is never before start: moving start past
 * the current end pulls end forward, and an end typed before start is
 * pulled up to start. Either half changing alone still ends valid.
 */
function clampRange(next: DateRangeValue): DateRangeValue {
  const { start, end } = next;
  if (start && end && start > end) return { start, end: start };
  return next;
}

function ClearButton({
  label,
  disabled,
  onClear,
}: {
  label: string;
  disabled: boolean;
  onClear: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      disabled={disabled}
      onClick={onClear}
    >
      <X className="h-4 w-4" />
    </Button>
  );
}

type RangeBoundsProps = Omit<DateRangeFieldProps, 'presets'> & { startId: string; endId: string };

function RangeBounds({
  value,
  onChange,
  startId,
  endId,
  startLabel = 'Start',
  endLabel = 'End',
  clearLabel = 'Clear',
  disabled = false,
  variant,
  size,
}: RangeBoundsProps) {
  const { start, end } = value;
  const hasValue = Boolean(start || end);

  return (
    <div className="flex items-end gap-2">
      <BoundInput
        id={startId}
        label={startLabel}
        inputProps={{
          variant,
          size,
          disabled,
          value: start,
          max: end || undefined,
          onChange: (e) => {
            onChange(clampRange({ start: e.target.value, end }));
          },
        }}
      />
      <BoundInput
        id={endId}
        label={endLabel}
        inputProps={{
          variant,
          size,
          disabled,
          value: end,
          min: start || undefined,
          onChange: (e) => {
            onChange(clampRange({ start, end: e.target.value }));
          },
        }}
      />
      {hasValue && (
        <ClearButton
          label={clearLabel}
          disabled={disabled}
          onClear={() => {
            onChange({ start: '', end: '' });
          }}
        />
      )}
    </div>
  );
}

/**
 * Start/end date range with an end-not-before-start invariant, an optional
 * clear affordance, and optional presets. The native date picker is
 * retained — this composes `DateInput`, it doesn't replace it with a custom
 * calendar grid.
 */
export function DateRangeField({ presets = NO_PRESETS, ...rest }: DateRangeFieldProps) {
  const startId = useId();
  const endId = useId();

  return (
    <div className={cn('flex flex-col gap-3', rest.className)}>
      <PresetsRow
        presets={presets}
        disabled={rest.disabled ?? false}
        onPick={(preset) => {
          rest.onChange(preset.range());
        }}
      />
      <RangeBounds {...rest} startId={startId} endId={endId} />
    </div>
  );
}
