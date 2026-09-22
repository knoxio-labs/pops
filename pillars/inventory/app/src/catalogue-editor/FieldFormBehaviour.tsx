import { Archive } from 'lucide-react';

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Label,
  SelectContent,
  SelectItem,
  SelectPrimitive,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@pops/ui';

import { useFieldFormContext } from './FieldFormContext';

import type { BinaryOperation } from './FieldFormContext';

function binaryOperation(value: string): BinaryOperation | undefined {
  return (['add', 'subtract', 'multiply', 'divide'] as const).find(
    (operation) => operation === value
  );
}

/** Renders required, presentation, storage, and computed-expression controls. */
export function FieldFormBehaviour() {
  const { field, shapeLocked, storage } = useFieldFormContext();
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldToggle
          id="catalogue-required"
          label="Required"
          detail="Items must have at least one value."
          value="required"
        />
        <FieldToggle
          id="catalogue-highlighted"
          label="Highlighted"
          detail="Show this value in item summaries."
          value="highlighted"
        />
        <FieldToggle
          id="catalogue-computed"
          label="Computed field"
          detail="Evaluate a closed expression instead of storing a value."
          value="computed"
          disabled={shapeLocked}
        />
        {storage === 'computed' && (
          <FieldToggle
            id="catalogue-override"
            label="Allow override"
            detail="An explicit value wins over the computed result."
            value="override"
          />
        )}
      </div>
      {storage === 'computed' && <ComputedExpression />}
      {shapeLocked && (
        <Alert>
          <Archive />
          <AlertTitle>Published shape is locked</AlertTitle>
          <AlertDescription>
            Replace this field to change its primitive, cardinality, storage, unit, or reference
            constraints.
          </AlertDescription>
        </Alert>
      )}
      {field?.archivedAt !== null && field?.archivedAt !== undefined && (
        <Alert>
          <Archive />
          <AlertTitle>This field is archived</AlertTitle>
          <AlertDescription>
            Existing items retain this definition, but new items cannot select it.
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}

function FieldToggle({
  detail,
  disabled = false,
  id,
  label,
  value,
}: {
  readonly detail: string;
  readonly disabled?: boolean;
  readonly id: string;
  readonly label: string;
  readonly value: 'required' | 'highlighted' | 'computed' | 'override';
}) {
  const context = useFieldFormContext();
  const values = {
    required: context.required,
    highlighted: context.highlighted,
    computed: context.storage === 'computed',
    override: context.allowOverride,
  };
  const change = (checked: boolean) => {
    if (value === 'required') context.setRequired(checked);
    if (value === 'highlighted') context.setHighlighted(checked);
    if (value === 'computed') context.setStorage(checked ? 'computed' : 'stored');
    if (value === 'override') context.setAllowOverride(checked);
  };
  return (
    <div className="flex min-h-11 items-start justify-between gap-4 rounded-lg border p-3">
      <div>
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </div>
      <Switch id={id} checked={values[value]} disabled={disabled} onCheckedChange={change} />
    </div>
  );
}

function ComputedExpression() {
  const {
    expressionOperation,
    leftFieldId,
    rightFieldId,
    setExpressionOperation,
    setLeftFieldId,
    setRightFieldId,
  } = useFieldFormContext();
  return (
    <section className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <div className="space-y-2">
        <Label>Operation</Label>
        <SelectPrimitive
          value={expressionOperation}
          onValueChange={(value) => {
            const operation = binaryOperation(value);
            if (operation !== undefined) setExpressionOperation(operation);
          }}
        >
          <SelectTrigger className="min-h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['add', 'subtract', 'multiply', 'divide'] as const).map((operation) => (
              <SelectItem key={operation} value={operation}>
                {operation}
              </SelectItem>
            ))}
          </SelectContent>
        </SelectPrimitive>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Operand label="Left field" value={leftFieldId} onChange={setLeftFieldId} />
        <Operand label="Right field" value={rightFieldId} onChange={setRightFieldId} />
      </div>
    </section>
  );
}

function Operand({
  label,
  onChange,
  value,
}: {
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  const { candidates } = useFieldFormContext();
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <SelectPrimitive value={value} onValueChange={onChange}>
        <SelectTrigger className="min-h-11">
          <SelectValue placeholder="Choose a field" />
        </SelectTrigger>
        <SelectContent>
          {candidates.map((candidate) => (
            <SelectItem key={candidate.id} value={candidate.id}>
              {candidate.label} · {candidate.kind}
            </SelectItem>
          ))}
        </SelectContent>
      </SelectPrimitive>
    </div>
  );
}
