/**
 * Option fields. One value is a select; several are toggle pills, every
 * option visible so choosing is one click each. A retired option still
 * held by the item shows as held, marked retired, and can be removed but
 * not chosen again.
 */
import { Check } from 'lucide-react';

import {
  ButtonPrimitive,
  SelectContent,
  SelectItem,
  SelectPrimitive,
  SelectTrigger,
  SelectValue,
  cn,
} from '@pops/ui';

import type { EnumOption, FormFieldDef } from './field-model';

const NONE = '__none__';

/** One option, chosen from a select. Retired options are listed only when held. */
export function EnumSelect({
  field,
  value,
  onChange,
}: {
  field: FormFieldDef;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = (field.options ?? []).filter((option) => !option.retired || option.id === value);
  return (
    <SelectPrimitive
      value={value === '' ? NONE : value}
      onValueChange={(next) => onChange(next === NONE ? '' : next)}
    >
      <SelectTrigger id={`field-${field.id}`} className="h-9 w-full" aria-label={field.label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Not set</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.retired ? `${option.label} (retired)` : option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectPrimitive>
  );
}

function Pill({
  option,
  chosen,
  onToggle,
}: {
  option: EnumOption;
  chosen: boolean;
  onToggle: () => void;
}) {
  const locked = option.retired === true && !chosen;
  return (
    <ButtonPrimitive
      variant="outline"
      size="xs"
      aria-pressed={chosen}
      disabled={locked}
      onClick={onToggle}
      className={cn(
        'h-8 gap-1 rounded-full px-3 text-sm font-normal',
        chosen && 'border-app-accent/50 bg-app-accent/10 text-foreground',
        option.retired && 'border-dashed'
      )}
    >
      {chosen ? <Check className="size-3.5 text-app-accent" aria-hidden /> : null}
      {option.label}
      {option.retired ? <span className="text-xs text-muted-foreground">retired</span> : null}
    </ButtonPrimitive>
  );
}

/** Several options, as toggles. The held order is kept; a new choice goes last. */
export function EnumPills({
  field,
  values,
  onChange,
}: {
  field: FormFieldDef;
  values: readonly string[];
  onChange: (values: readonly string[]) => void;
}) {
  const options = (field.options ?? []).filter(
    (option) => !option.retired || values.includes(option.id)
  );
  return (
    <div role="group" aria-label={field.label} className="flex flex-wrap gap-1.5 py-0.5">
      {options.map((option) => {
        const chosen = values.includes(option.id);
        return (
          <Pill
            key={option.id}
            option={option}
            chosen={chosen}
            onToggle={() =>
              onChange(chosen ? values.filter((id) => id !== option.id) : [...values, option.id])
            }
          />
        );
      })}
    </div>
  );
}
