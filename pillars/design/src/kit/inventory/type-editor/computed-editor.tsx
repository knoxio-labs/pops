import { AlertCircle, Braces, RefreshCw } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle, Label, cn } from '@pops/ui';

import { FieldToggle } from './primitive-settings';

function DependencyError({ error }: { error?: 'dependency' | 'cycle' }) {
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

/** Computed expression, override policy, dependency failures and cycle state. */
export function ComputedEditor({ error }: { error?: 'dependency' | 'cycle' }) {
  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldToggle
          id="computed"
          label="Computed field"
          detail="Evaluate a typed expression instead of storing a value."
          checked
        />
        <FieldToggle
          id="override"
          label="Allow override"
          detail="An explicit value wins without evaluating dependencies."
          checked
        />
      </div>
      <div className="space-y-2">
        <Label>Expression</Label>
        <div className="space-y-2 rounded-lg border bg-muted/40 p-3 font-mono text-sm">
          <div className="flex items-center gap-2">
            <Braces className="h-4 w-4 text-primary" />
            <span>multiply</span>
          </div>
          <div className="ml-6 flex min-h-11 items-center gap-2 rounded-md border bg-card px-3">
            <span className="text-muted-foreground">read</span>
            <span>Unit price</span>
          </div>
          <div
            className={cn(
              'ml-6 flex min-h-11 items-center gap-2 rounded-md border bg-card px-3',
              error && 'border-destructive'
            )}
          >
            <span className="text-muted-foreground">read</span>
            <span>{error === 'cycle' ? 'Replacement value' : 'Package count'}</span>
          </div>
        </div>
      </div>
      <DependencyError error={error} />
      <div className="rounded-lg border p-3">
        <p className="text-sm font-medium">Preview</p>
        <p className="mt-1 text-sm text-muted-foreground">$48.00 = $12.00 × 4</p>
        <p className="mt-2 text-xs text-muted-foreground">
          2 dependencies · 3 expression nodes · protocol 2
        </p>
      </div>
    </section>
  );
}
