/**
 * Several long-text values: one short text box per value, in order, each
 * removable, and one button that adds the next. Chips cannot hold
 * paragraphs, so this kind gets its own list.
 */
import { Plus, X } from 'lucide-react';

import { Button, ButtonPrimitive, Textarea, cn } from '@pops/ui';

import { PROBLEM_RING } from './field-note';

import type { FormFieldDef } from './field-model';

/** Props for {@link LongTextList}. */
export interface LongTextListProps {
  field: FormFieldDef;
  values: readonly string[];
  onChange: (values: readonly string[]) => void;
  invalid?: boolean;
  describedBy?: string;
}

function replaceAt(values: readonly string[], index: number, value: string): string[] {
  return values.map((current, at) => (at === index ? value : current));
}

/** Several paragraphs for one field. */
export function LongTextList({ field, values, onChange, invalid, describedBy }: LongTextListProps) {
  const shown = values.length === 0 ? [''] : values;
  return (
    <div className="space-y-1.5">
      <ol className="space-y-1.5" aria-label={`${field.label} values`}>
        {shown.map((value, index) => (
          <li key={`${field.id}-${String(index)}`} className="flex items-start gap-1">
            <Textarea
              value={value}
              rows={2}
              aria-label={`${field.label}, value ${String(index + 1)}`}
              aria-describedby={describedBy}
              onChange={(event) => onChange(replaceAt(shown, index, event.target.value))}
              className={cn('min-h-14 resize-none text-sm', invalid && PROBLEM_RING)}
            />
            <ButtonPrimitive
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove ${field.label} value ${String(index + 1)}`}
              onClick={() => onChange(shown.filter((_, at) => at !== index))}
              className="text-muted-foreground"
            >
              <X className="size-3.5" aria-hidden />
            </ButtonPrimitive>
          </li>
        ))}
      </ol>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange([...shown, ''])}
        prefix={<Plus className="size-3.5" aria-hidden />}
        className="text-muted-foreground"
      >
        Add another
      </Button>
    </div>
  );
}
