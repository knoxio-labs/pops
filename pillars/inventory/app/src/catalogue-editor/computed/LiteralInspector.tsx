import { valueTypeLabel } from '@pops/inventory/expression';
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

import { setLiteral } from './builder-actions';
import { useBuilder } from './BuilderContext';
import { choiceFieldAt } from './node-labels';

import type { ExpressionField, LiteralValue } from '@pops/inventory/expression';

type Commit = (value: LiteralValue) => void;

function textHint(value: string): string {
  if (value.trim() === '' && value.length > 0)
    return `${value.length === 1 ? 'One space' : `${value.length} spaces`}, kept exactly as typed.`;
  return 'Kept exactly as typed, including spaces.';
}

function integerOrText(text: string): LiteralValue {
  const parsed = Number(text);
  return /^-?\d+$/u.test(text) && Number.isSafeInteger(parsed) ? parsed : text;
}

function BooleanLiteral({ value, commit }: { value: boolean; commit: Commit }) {
  return (
    <RadioGroup
      value={value ? 'yes' : 'no'}
      onValueChange={(next) => commit(next === 'yes')}
      className="flex gap-4"
    >
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

function ChoiceLiteral({
  optionId,
  field,
  commit,
}: {
  optionId: string;
  field: ExpressionField | undefined;
  commit: Commit;
}) {
  return (
    <SelectPrimitive
      value={optionId}
      onValueChange={(next) => {
        if (next !== '') commit({ optionId: next });
      }}
    >
      <SelectTrigger id="literal-value" className="min-h-11 w-full">
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
  integer,
  commit,
}: {
  value: LiteralValue;
  choiceField: ExpressionField | undefined;
  integer: boolean;
  commit: Commit;
}) {
  if (typeof value === 'boolean') return <BooleanLiteral value={value} commit={commit} />;
  if (typeof value === 'object' && 'optionId' in value)
    return <ChoiceLiteral optionId={value.optionId} field={choiceField} commit={commit} />;
  if (typeof value === 'object' && 'amount' in value)
    return (
      <div className="flex items-center gap-2">
        <Input
          id="literal-value"
          value={value.amount}
          onChange={(event) => commit({ amount: event.target.value, unit: value.unit })}
          inputMode="decimal"
          className="min-h-11 font-mono"
        />
        <Badge variant="outline">{value.unit}</Badge>
      </div>
    );
  if (typeof value === 'object') return <p className="font-mono text-sm">{value.targetId}</p>;
  return (
    <div className="space-y-1">
      <Input
        id="literal-value"
        value={String(value)}
        onChange={(event) =>
          commit(integer ? integerOrText(event.target.value) : event.target.value)
        }
        inputMode={integer ? 'numeric' : undefined}
        className="min-h-11 whitespace-pre font-mono"
      />
      {!integer && typeof value === 'string' && !/^-?\d+(\.\d+)?$/u.test(value) && (
        <p className="text-xs text-muted-foreground">{textHint(value)}</p>
      )}
    </div>
  );
}

/**
 * Edits a fixed value with the control its slot type needs: a number, an
 * amount in the fixed unit, text, yes or no, or one of the partner field's
 * choices. Whether the value is acceptable is the server's to say.
 */
export function LiteralInspector({ value }: { value: LiteralValue }) {
  const builder = useBuilder();
  const { context, root, selectedPath } = builder;
  const expected = builder.slots.get(selectedPath);
  return (
    <div className="space-y-2">
      <Label htmlFor="literal-value">
        Value{expected === undefined ? '' : ` (${valueTypeLabel(expected)})`}
      </Label>
      <LiteralInput
        value={value}
        choiceField={choiceFieldAt(context, root, selectedPath)}
        integer={expected?.kind === 'integer' || typeof value === 'number'}
        commit={(next) => builder.change(setLiteral(root, selectedPath, next))}
      />
    </div>
  );
}
