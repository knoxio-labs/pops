import { TriangleAlert } from 'lucide-react';
import { useId } from 'react';

import { Label, RadioGroup, RadioGroupItem, cn } from '@pops/ui';

import type { OverridePolicy } from './scenario';

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

function OverrideChangeNote({ policy }: { policy: OverridePolicy }) {
  const turnedOff = policy.publishedAllowOverride === true && !policy.allowOverride;
  if (!turnedOff || policy.itemsWithOverride === undefined) return null;
  return (
    <p className="flex items-start gap-2 text-xs text-warning">
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {policy.itemsWithOverride} items hold an override today. Published revision 12 allows them.
    </p>
  );
}

/**
 * Whether an explicit value may replace the calculated one: a two-way choice
 * on one row, with the chosen behaviour spelled out in terms of what an item
 * shows rather than the flag's name.
 */
export function OverridePolicyControl({ policy }: { policy: OverridePolicy }) {
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
          defaultValue={value}
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
