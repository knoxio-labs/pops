import { TriangleAlert } from 'lucide-react';
import { useId } from 'react';

import { Label, RadioGroup, RadioGroupItem, cn } from '@pops/ui';

const CHOICES = [
  {
    value: 'computed',
    label: 'Always calculated',
    detail: 'Items always show the result; nobody can type a value in.',
  },
  {
    value: 'override',
    label: 'Allow override',
    detail: 'A typed value wins until cleared, and fills in when the result is unavailable.',
  },
] as const;

/** Whether the field accepts an explicit value, and what the published revision allows. */
export interface OverridePolicy {
  readonly allowOverride: boolean;
  readonly publishedAllowOverride?: boolean;
  readonly publishedRevision?: number;
  /** Items the draft's compatibility check found holding an override, when it counted them. */
  readonly itemsWithOverride?: number;
}

/**
 * Words the discarded-override count for the change note: unknown evidence
 * stays hedged, a confirmed zero says so plainly, and a confirmed count is
 * stated as read.
 */
function overrideHeldSentence(itemsWithOverride: number | undefined): string {
  if (itemsWithOverride === undefined) return 'Items may hold an override today.';
  if (itemsWithOverride === 0) return 'No items hold an override today.';
  return `${itemsWithOverride} items hold an override today.`;
}

function OverrideChangeNote({ policy }: { policy: OverridePolicy }) {
  const turnedOff = policy.publishedAllowOverride === true && !policy.allowOverride;
  if (!turnedOff) return null;
  const held = overrideHeldSentence(policy.itemsWithOverride);
  const revision =
    policy.publishedRevision === undefined
      ? 'The published revision'
      : `Published revision ${policy.publishedRevision}`;
  return (
    <p className="flex items-start gap-2 text-xs text-warning">
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {held} {revision} allows them.
    </p>
  );
}

/**
 * Whether an explicit value may replace the calculated one: a two-way choice
 * on one row, with the chosen behaviour spelled out in terms of what an item
 * shows rather than the flag's name.
 */
export function OverridePolicyControl({
  policy,
  onChange,
}: {
  policy: OverridePolicy;
  onChange: (allowOverride: boolean) => void;
}) {
  const value = policy.allowOverride ? 'override' : 'computed';
  const labelId = useId();
  const chosen = CHOICES.find((choice) => choice.value === value);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-3">
        <span id={labelId} className="text-sm font-medium">
          Overrides
        </span>
        <RadioGroup
          value={value}
          onValueChange={(next) => onChange(next === 'override')}
          aria-labelledby={labelId}
          className="flex gap-1 rounded-lg border p-1"
        >
          {CHOICES.map((choice) => (
            <Label
              key={choice.value}
              htmlFor={`${labelId}-${choice.value}`}
              className={cn(
                'flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-3 text-sm font-normal',
                choice.value === value && 'bg-primary/10 font-medium text-primary'
              )}
            >
              <RadioGroupItem id={`${labelId}-${choice.value}`} value={choice.value} />
              {choice.label}
            </Label>
          ))}
        </RadioGroup>
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">{chosen?.detail}</p>
      </div>
      <OverrideChangeNote policy={policy} />
    </div>
  );
}
