import { AlertCircle, Braces, Check, Plus, RefreshCw, Trash2 } from 'lucide-react';

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Label,
  SelectContent,
  SelectItem,
  SelectPrimitive,
  SelectTrigger,
  SelectValue,
  cn,
} from '@pops/ui';

import { FieldToggle } from './primitive-settings';

type ExpressionError = 'dependency' | 'cycle';

function DependencyError({ error }: { error?: ExpressionError }) {
  if (error === 'dependency') {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Dependency is unavailable</AlertTitle>
        <AlertDescription>
          Package count is not defined on every allowed target type. Narrow the reference target or
          choose another field.
        </AlertDescription>
      </Alert>
    );
  }
  if (error === 'cycle') {
    return (
      <Alert variant="destructive">
        <RefreshCw />
        <AlertTitle>Expression creates a cycle</AlertTitle>
        <AlertDescription>
          Replacement value reads itself through Unit price. Cycles can also cross up to two item
          references and cannot be published.
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}

function FieldSelect({ value }: { value: 'unit-price' | 'package-count' | 'replacement-value' }) {
  return (
    <SelectPrimitive defaultValue={value}>
      <SelectTrigger className="min-h-11">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="unit-price">Unit price · decimal</SelectItem>
        <SelectItem value="package-count">Package count · integer</SelectItem>
        <SelectItem value="replacement-value">Replacement value · decimal</SelectItem>
      </SelectContent>
    </SelectPrimitive>
  );
}

function Operand({
  index,
  field,
  error,
}: {
  index: number;
  field: 'unit-price' | 'package-count' | 'replacement-value';
  error?: boolean;
}) {
  return (
    <div className={cn('space-y-3 rounded-lg border bg-card p-3', error && 'border-destructive')}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full border text-xs">
            {index}
          </span>
          <span className="text-sm font-medium">Read a field</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="min-h-11 min-w-11"
          aria-label={`Remove operand ${index}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>From</Label>
          <SelectPrimitive defaultValue="current-item">
            <SelectTrigger className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current-item">This item</SelectItem>
              <SelectItem value="reference">Referenced item…</SelectItem>
            </SelectContent>
          </SelectPrimitive>
        </div>
        <div className="space-y-2">
          <Label>Field</Label>
          <FieldSelect value={field} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Path depth 0 · required when this branch evaluates
      </p>
    </div>
  );
}

function ExpressionBuilder({ error }: { error?: ExpressionError }) {
  return (
    <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Label>Operation</Label>
          <SelectPrimitive defaultValue="multiply">
            <SelectTrigger className="min-h-11 min-w-48 font-mono">
              <Braces className="h-4 w-4 text-primary" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="multiply">multiply</SelectItem>
              <SelectItem value="add">add</SelectItem>
              <SelectItem value="if">if</SelectItem>
              <SelectItem value="coalesce">coalesce</SelectItem>
            </SelectContent>
          </SelectPrimitive>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline">Returns decimal</Badge>
          <Badge variant="outline">Expression v1</Badge>
        </div>
      </div>
      <Operand index={1} field="unit-price" />
      <Operand
        index={2}
        field={error === 'cycle' ? 'replacement-value' : 'package-count'}
        error={error !== undefined}
      />
      <Button variant="outline" size="sm">
        <Plus className="h-4 w-4" />
        Add operand
      </Button>
    </div>
  );
}

/** Computed expression, override policy, dependency failures and cycle state. */
export function ComputedEditor({ error }: { error?: ExpressionError }) {
  return (
    <section className="space-y-5">
      <div>
        <h3 className="font-semibold">Computed value</h3>
        <p className="text-sm text-muted-foreground">
          Build a typed expression from this item or fields reached through up to two item
          references.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldToggle
          id="computed"
          label="Computed field"
          detail="Evaluate this expression instead of storing a value."
          checked
        />
        <FieldToggle
          id="override"
          label="Allow override"
          detail="An explicit value wins without evaluating dependencies."
          checked
        />
      </div>
      <ExpressionBuilder error={error} />
      <DependencyError error={error} />
      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Preview with MacBook charger</p>
          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
            <Check className="h-3 w-3" />
            Valid
          </Badge>
        </div>
        <p className="mt-3 text-lg font-semibold">$48.00</p>
        <p className="text-sm text-muted-foreground">Unit price $12.00 × package count 4</p>
        <p className="mt-2 text-xs text-muted-foreground">
          2 dependencies · 3 expression nodes · source: computed · protocol 2
        </p>
      </div>
    </section>
  );
}
