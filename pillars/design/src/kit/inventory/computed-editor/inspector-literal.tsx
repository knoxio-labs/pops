import {
  Badge,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  SelectContent,
  SelectItem,
  SelectPrimitive,
  SelectTrigger,
  SelectValue,
} from '@pops/ui';

import { valueTypeLabel } from './model';

import type { DesignField, LiteralValue, ValueType } from './model';

function textHint(value: string): string {
  if (value.trim() === '' && value.length > 0)
    return `${value.length === 1 ? 'One space' : `${value.length} spaces`}, kept exactly as typed.`;
  return 'Kept exactly as typed, including spaces.';
}

function BooleanLiteral({ value }: { value: boolean }) {
  return (
    <RadioGroup defaultValue={value ? 'yes' : 'no'} className="flex gap-4">
      <div className="flex min-h-11 items-center gap-2">
        <RadioGroupItem id="literal-yes" value="yes" />
        <Label htmlFor="literal-yes">Yes</Label>
      </div>
      <div className="flex min-h-11 items-center gap-2">
        <RadioGroupItem id="literal-no" value="no" />
        <Label htmlFor="literal-no">No</Label>
      </div>
    </RadioGroup>
  );
}

function ChoiceLiteral({ optionId, field }: { optionId: string; field: DesignField | undefined }) {
  return (
    <SelectPrimitive defaultValue={optionId}>
      <SelectTrigger className="min-h-11 w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(field?.options ?? []).map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectPrimitive>
  );
}

function LiteralInput({
  value,
  choiceField,
}: {
  value: LiteralValue;
  choiceField: DesignField | undefined;
}) {
  if (typeof value === 'boolean') return <BooleanLiteral value={value} />;
  if (typeof value === 'object' && 'optionId' in value)
    return <ChoiceLiteral optionId={value.optionId} field={choiceField} />;
  if (typeof value === 'object')
    return (
      <div className="flex items-center gap-2">
        <Input
          id="literal-value"
          defaultValue={value.amount}
          inputMode="decimal"
          className="min-h-11 font-mono"
        />
        <Badge variant="outline">{value.unit}</Badge>
      </div>
    );
  return (
    <div className="space-y-1">
      <Input
        id="literal-value"
        defaultValue={String(value)}
        inputMode={typeof value === 'number' ? 'numeric' : undefined}
        className="min-h-11 font-mono whitespace-pre"
      />
      {typeof value === 'string' && (
        <p className="text-xs text-muted-foreground">{textHint(value)}</p>
      )}
    </div>
  );
}

/**
 * Edits a fixed value with the control its slot type needs: a number, an
 * amount in the fixed unit, text, yes or no, or one of the partner field's choices.
 */
export function LiteralInspector({
  value,
  expected,
  choiceField,
}: {
  value: LiteralValue;
  expected: ValueType | undefined;
  choiceField: DesignField | undefined;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="literal-value">
        Value{expected === undefined ? '' : ` (${valueTypeLabel(expected)})`}
      </Label>
      <LiteralInput value={value} choiceField={choiceField} />
    </div>
  );
}
